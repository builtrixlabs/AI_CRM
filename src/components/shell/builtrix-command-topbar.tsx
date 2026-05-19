"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition, useMemo, useCallback } from "react";
import { Bell, LogOut, Search } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useNewLeadDialog } from "@/components/dashboard/new-lead-dialog-context";
import type { RoleTier } from "@/lib/auth/role-tier";

type Props = {
  tier: RoleTier;
  roleLabel: string;
  displayName: string | null;
  /** "Aanya Sharma" or org name shown as second crumb. */
  workspaceLabel?: string | null;
  /** Notification count badge. 0 hides the badge. */
  notificationCount?: number;
};

export function BuiltrixCommandTopbar({
  tier,
  roleLabel,
  displayName,
  workspaceLabel,
  notificationCount = 0,
}: Props) {
  const pathname = usePathname();
  const crumbs = useMemo(() => crumbsFromPathname(pathname), [pathname]);

  return (
    <header className="bcmd-topbar" aria-label="Command topbar">
      <div className="flex min-w-0 flex-col">
        <span className="bcmd-topbar-breadcrumb-eyebrow truncate">
          {crumbs.eyebrow}
        </span>
        <span className="bcmd-topbar-breadcrumb-title truncate">
          {crumbs.title}
        </span>
      </div>

      <div className="flex flex-1 justify-center">
        <SearchTrigger />
      </div>

      <div className="flex items-center gap-2">
        <span
          className="bcmd-role-chip hidden md:inline-flex"
          data-role-tier={tier}
          aria-label={`Signed in as ${roleLabel}`}
        >
          {roleLabel}
        </span>
        {workspaceLabel ? (
          <span className="hidden lg:flex flex-col text-right leading-tight">
            <span className="font-display text-[11px] text-[var(--fg3)] uppercase tracking-wider">
              Workspace
            </span>
            <span className="font-display text-[12px] font-semibold text-[var(--fg1)]">
              {workspaceLabel}
            </span>
          </span>
        ) : null}
        <NotificationButton count={notificationCount} />
        <PrimaryCta tier={tier} />
        <SignOutButton />
        <AvatarLink displayName={displayName} />
      </div>
    </header>
  );
}

// ---------- Search trigger (opens existing CommandPalette via Cmd+K hotkey) ----------
function SearchTrigger() {
  const handleOpen = useCallback(() => {
    // Synthesize the Cmd+K event the CommandPalette already listens for.
    // Keeps the palette contract intact (one source of truth: keyboard
    // hotkey), no new context wiring required for one trigger.
    const ev = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ev);
  }, []);
  return (
    <button
      type="button"
      onClick={handleOpen}
      className="bcmd-search text-left"
      aria-label="Open command palette"
      data-testid="bcmd-search-trigger"
    >
      <span
        className="bcmd-search-input flex items-center gap-2 cursor-pointer"
        style={{ paddingLeft: 38 }}
      >
        <Search
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 16,
            height: 16,
            color: "var(--fg3)",
          }}
        />
        <span className="text-[var(--fg3)]">
          Search leads, calls, agreements…
        </span>
      </span>
      <span className="bcmd-search-kbd" aria-hidden="true">
        ⌘K
      </span>
    </button>
  );
}

// ---------- Notification bell ----------
function NotificationButton({ count }: { count: number }) {
  return (
    <button
      type="button"
      className="bcmd-icon-btn"
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
    >
      <Bell aria-hidden="true" className="h-4 w-4" />
      {count > 0 ? (
        <span className="bcmd-icon-btn-badge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}

// ---------- Primary CTA — opens New Lead dialog from existing provider ----------
function PrimaryCta({ tier }: { tier: RoleTier }) {
  const { openDialog } = useNewLeadDialog();
  const label = tier === "agent" ? "Quick add lead" : "New lead";
  return (
    <button
      type="button"
      className="bcmd-cta hidden sm:inline-flex"
      onClick={() => openDialog()}
      data-testid="bcmd-primary-cta"
    >
      {label}
    </button>
  );
}

// ---------- Sign out (matches existing topbar behaviour) ----------
function SignOutButton() {
  const [pending, startTransition] = useTransition();
  function handleClick() {
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
      } catch {
        // Hard-nav below clears the SSR cookie regardless.
      } finally {
        window.location.href = "/auth/sign-in";
      }
    });
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="bcmd-icon-btn"
      aria-label="Sign out"
      data-testid="bcmd-sign-out"
    >
      <LogOut aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

function AvatarLink({ displayName }: { displayName: string | null }) {
  const initials = computeInitials(displayName);
  return (
    <Link
      href="/dashboard/settings"
      className="bcmd-sidebar-user-avatar"
      aria-label="Profile and settings"
    >
      {initials}
    </Link>
  );
}

// ---------- crumb derivation ----------
export function crumbsFromPathname(pathname: string | null): {
  eyebrow: string;
  title: string;
} {
  if (!pathname || pathname === "/dashboard") {
    return { eyebrow: "Command / Dashboard", title: "BUILTRIX COMMAND" };
  }
  const segs = pathname.split("/").filter(Boolean);
  // Drop leading "dashboard" so the eyebrow reads naturally.
  if (segs[0] === "dashboard") segs.shift();
  if (segs.length === 0) {
    return { eyebrow: "Command / Dashboard", title: "BUILTRIX COMMAND" };
  }
  const head = segs[0];
  const tail = segs.slice(1).map(titleCase);
  const eyebrow = ["Command", titleCase(head), ...tail].join(" / ");
  const title = (tail[tail.length - 1] ?? titleCase(head)).toUpperCase();
  return { eyebrow, title };
}

function titleCase(s: string): string {
  if (!s) return s;
  return s
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function computeInitials(name: string | null): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
