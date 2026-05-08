"use client";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  searchLeads,
  type SearchLeadResult,
} from "@/app/(dashboard)/dashboard/_actions/searchLeads";
import { COMMANDS, visibleCommands } from "@/lib/cmdk";
import type { Command as CommandSpec, CommandGroup } from "@/lib/cmdk/types";
import type { Permission } from "@/lib/auth/rbac";
import { useNewLeadDialog } from "@/components/dashboard/new-lead-dialog-context";
import { useCmdkHotkey } from "./use-cmdk-hotkey";
import {
  ACTION_HANDLERS,
  defaultToggleTheme,
  type DispatchContext,
} from "./dispatch";
import { LookupResults } from "./lookup-results";

type Props = {
  /** Permissions resolved server-side and serialized as a string array. */
  visiblePerms: readonly string[];
  /** Optional override of `searchLeads` for tests. */
  searchLeadsImpl?: typeof searchLeads;
  /** Optional override for sign-out (for tests). */
  signOutImpl?: () => Promise<void>;
};

const GROUP_LABEL: Record<CommandGroup, string> = {
  navigation: "Navigation",
  leads: "Leads",
  operations: "Operations",
  account: "Account",
  help: "Help",
};

const LOOKUP_DEBOUNCE_MS = 200;

export function CommandPalette({
  visiblePerms,
  searchLeadsImpl = searchLeads,
  signOutImpl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"catalog" | "lookup">("catalog");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchLeadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { openDialog: openNewLeadDialog } = useNewLeadDialog();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const permsSet = useMemo<ReadonlySet<Permission>>(
    () => new Set(visiblePerms as readonly Permission[]),
    [visiblePerms],
  );
  const visible = useMemo(
    () => visibleCommands(COMMANDS, permsSet),
    [permsSet],
  );

  const closePalette = useCallback(() => {
    setOpen(false);
    setMode("catalog");
    setQuery("");
    setResults([]);
    setLoading(false);
  }, []);

  const openPalette = useCallback(() => setOpen(true), []);

  useCmdkHotkey(openPalette);

  const dispatchContext: DispatchContext = useMemo(
    () => ({
      push: (url: string) => router.push(url),
      openNewLeadDialog,
      toggleTheme: defaultToggleTheme,
      signOut:
        signOutImpl ??
        (async () => {
          // Lazy import to avoid pulling supabase into the catalog-only test path.
          const { createSupabaseBrowserClient } = await import(
            "@/lib/supabase/client"
          );
          await createSupabaseBrowserClient().auth.signOut();
          router.push("/auth/sign-in");
        }),
    }),
    [router, openNewLeadDialog, signOutImpl],
  );

  const runCommand = useCallback(
    async (cmd: CommandSpec) => {
      if (cmd.kind === "navigate" || cmd.kind === "placeholder") {
        if (cmd.target) router.push(cmd.target);
        closePalette();
        return;
      }
      if (cmd.kind === "lookup-prefix") {
        setMode("lookup");
        setQuery("");
        setResults([]);
        return;
      }
      if (cmd.kind === "action" && cmd.action) {
        const handler = ACTION_HANDLERS[cmd.action];
        await handler(dispatchContext);
        closePalette();
      }
    },
    [router, closePalette, dispatchContext],
  );

  // Debounced lookup search.
  useEffect(() => {
    if (mode !== "lookup") return;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    if (query.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      const r = await searchLeadsImpl(query);
      if (r.ok) {
        setResults(r.results);
      } else {
        setResults([]);
      }
      setLoading(false);
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [mode, query, searchLeadsImpl]);

  const grouped = useMemo(() => {
    const map = new Map<CommandGroup, CommandSpec[]>();
    for (const c of visible) {
      const list = map.get(c.group as CommandGroup) ?? [];
      list.push(c as CommandSpec);
      map.set(c.group as CommandGroup, list);
    }
    return map;
  }, [visible]);

  const handleSelectLookupResult = useCallback(
    (r: SearchLeadResult) => {
      router.push(`/dashboard/leads/${r.id}`);
      closePalette();
    },
    [router, closePalette],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closePalette();
        else setOpen(true);
      }}
    >
      <DialogContent
        data-testid="command-palette"
        data-mode={mode}
        className="max-w-xl overflow-hidden p-0"
      >
        <Command
          label="Command palette"
          loop
          shouldFilter={mode === "catalog"}
          onKeyDownCapture={(e) => {
            if (e.key === "Escape" && mode === "lookup") {
              e.preventDefault();
              e.stopPropagation();
              setMode("catalog");
              setQuery("");
              setResults([]);
            }
          }}
        >
          <Command.Input
            autoFocus
            data-testid="command-palette-input"
            placeholder={
              mode === "lookup"
                ? "Search leads by name or phone…"
                : "Type a command or search…"
            }
            value={query}
            onValueChange={setQuery}
            className="w-full border-b border-neutral-200 bg-transparent px-4 py-3 text-sm outline-none"
          />
          <Command.List className="max-h-96 overflow-y-auto">
            {mode === "catalog" ? (
              <>
                <Command.Empty
                  data-testid="command-palette-empty"
                  className="px-4 py-3 text-sm text-neutral-500"
                >
                  No commands match.
                </Command.Empty>
                {Array.from(grouped.entries()).map(([groupKey, items]) => (
                  <Command.Group
                    key={groupKey}
                    heading={GROUP_LABEL[groupKey]}
                    data-testid={`command-group-${groupKey}`}
                  >
                    {items.map((cmd) => (
                      <Command.Item
                        key={cmd.id}
                        value={`${cmd.label} ${cmd.id}`}
                        data-testid={`command-${cmd.id}`}
                        onSelect={() => {
                          void runCommand(cmd);
                        }}
                        className="flex cursor-pointer items-center justify-between px-4 py-2 text-sm aria-selected:bg-neutral-100"
                      >
                        <span>{cmd.label}</span>
                        {cmd.hint ? (
                          <span className="text-xs text-neutral-400">
                            {cmd.hint}
                          </span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </>
            ) : (
              <LookupResults
                query={query}
                results={results}
                loading={loading}
                onSelect={handleSelectLookupResult}
              />
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
