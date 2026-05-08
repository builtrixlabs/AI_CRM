# Spec — 008-cmdk-bounded-catalog

## Acceptance criteria

(See [the directive](../../directives/008-cmdk-bounded-catalog.md) for
the full prose; AC numbers below match the directive.)

- [ ] **AC-1..AC-4** Cmd+K / Ctrl+K opens the palette (input focused);
      Esc + backdrop-click close.
- [ ] **AC-5..AC-8** With empty input, up to 30 commands grouped by
      `group`. cmdk fuzzy match filters; arrow keys move; Enter activates.
      Permission-gated visibility (resolved via `resolveForUser`).
- [ ] **AC-9..AC-10** Navigation commands push the target URL.
- [ ] **AC-11..AC-13** Action commands: Create new lead opens
      `<NewLeadDialog>` via `useNewLeadDialog()`; Toggle theme persists
      to localStorage; Sign out calls `supabase.auth.signOut()` →
      redirect.
- [ ] **AC-14..AC-17** Lookup sub-mode: "Open lead by name…" → 200ms
      debounced `searchLeads` server action returns ≤ 8 leads scoped
      by RLS to the caller's tenant; selecting navigates to
      `/dashboard/leads/<id>`.
- [ ] **AC-18** Placeholder commands navigate to
      `/dashboard/placeholder/<slug>` which renders a forward-link
      banner.
- [ ] **AC-19** First-keystroke-to-first-result p95 < 300ms (asserted
      ≤ 500ms in CI for flake margin).
- [ ] **AC-20..AC-22** All untagged tests pass; coverage ≥ 80/90 on
      `src/lib/cmdk/`, `src/components/cmdk/`, `searchLeads`;
      `npm run build` ✓.

---

## Data model

**No new tables, no migration.** D-008 reads from the existing `nodes`
table via the `searchLeads` server action.

D-002's `nodes (organization_id, workspace_id, node_type, state)`
index already covers the `searchLeads` access pattern when the query
filters on `node_type='lead'`. The ILIKE on `label` and
`data->>'phone'` does NOT use a btree index in V0 — measured cost is
acceptable at ≤ 50k leads per workspace; D-014 hardening can add a
trigram index if profiling flags it.

---

## API contracts

### `src/lib/cmdk/types.ts`

```ts
import type { Permission } from "@/lib/auth/rbac";

export type CommandGroup = "navigation" | "leads" | "operations" | "account" | "help";

export type CommandKind =
  | "navigate"        // pushes a URL
  | "action"          // calls a side-effect (open dialog, toggle theme, sign out)
  | "lookup-prefix"   // enters inline sub-mode (e.g. "Open lead by name…")
  | "placeholder";    // forward-pointer to a future directive

export type Command = {
  id: string;            // stable, kebab-case
  label: string;         // user-visible
  group: CommandGroup;
  kind: CommandKind;
  target?: string;       // URL for kind='navigate' or 'placeholder'
  action?: string;       // dispatch key for kind='action' (matches a Map in dispatch.ts)
  prefix?: string;       // sub-mode label, e.g. "Lead:"
  hint?: string;         // right-aligned hint text in the palette
  requires?: Permission[]; // ALL must be present
};

export const COMMANDS: readonly Command[] = [...] as const;
export type CommandId = (typeof COMMANDS)[number]["id"];
```

### `src/lib/cmdk/catalog.ts`

The 30-command literal. Locked into the directive; new commands are
amendments. Approximate group/kind distribution:

| Group | Count | Examples |
|---|---|---|
| navigation | 9 | Dashboard, Demo lead, Admin cockpit, Onboarding, Audit, Platform (super_admin), Settings · Users, Settings · Integrations, Subscriptions |
| leads | 10 | Create new lead, Open lead by name…, Show hot leads (placeholder), Show new/contacted/qualified/lost leads (placeholders), Show leads from <source> (3 placeholders) |
| operations | 5 | Show today's site visits (placeholder), Open deal by name… (placeholder), Open contact by name… (placeholder), View team (org_admin), Audit log |
| account | 4 | Toggle theme, Sign out, Help · Keyboard shortcuts, Subscriptions |
| help | 2 | About Builtrix, Send feedback (placeholder) |

Total: 30 (final count locked in the catalog literal; if Plan Mode
requests additions/removals, the literal changes accordingly and
tests update).

### `src/lib/cmdk/permissions.ts`

```ts
import type { Permission } from "@/lib/auth/rbac";
import type { Command } from "./types";

/** Filter the catalog to commands the user can see. */
export function visibleCommands(
  catalog: readonly Command[],
  perms: ReadonlySet<Permission>
): readonly Command[];
```

### `src/app/(dashboard)/dashboard/_actions/searchLeads.ts`

```ts
"use server";

export type SearchLeadResult = {
  id: string;
  label: string;
  state: string;
  phone?: string;
};

export async function searchLeads(
  query: string,
  limit?: number
): Promise<{ ok: true; results: SearchLeadResult[] } | { ok: false; error: "permission" | "validation" | "unknown"; message?: string }>;
```

Implementation: `getCurrentUser` → `requirePermission(user, 'leads:view')`
→ trim query, reject if length < 1 or > 80 → request-scoped server
client → `from('nodes').select('id, label, state, data').eq('node_type','lead')
.is('deleted_at', null).or('label.ilike.%q%,data->>phone.ilike.%q%').order('updated_at',{ ascending:false }).limit(limit ?? 8)`.

RLS handles the tenant scoping automatically. No service-role client.
No `read_sensitive` audit (operational-tier read).

### `src/components/cmdk/dispatch.ts`

```ts
export type ActionContext = {
  router: AppRouterInstance;
  signOut: () => Promise<void>;
  openNewLeadDialog: () => void;
  toggleTheme: () => void;
};

/** Map of command.action → handler. */
export const ACTION_HANDLERS: Record<string, (ctx: ActionContext) => void | Promise<void>>;
```

### `src/components/dashboard/new-lead-dialog-context.tsx`

```ts
export function NewLeadDialogProvider({ children }: { children: ReactNode }): JSX.Element;
export function useNewLeadDialog(): { open: boolean; openDialog: () => void; closeDialog: () => void };
```

A small React Context that wraps the existing `<NewLeadDialog>` so any
descendant (the palette, future toolbar, etc.) can open it
imperatively.

### `src/components/cmdk/use-cmdk-hotkey.ts`

```ts
export function useCmdkHotkey(onOpen: () => void): void;
```

A `useEffect` that listens for `keydown`, opens on
`Cmd/Ctrl+K`, ignores when an `<input>`/`<textarea>` is focused (so
editing UX stays intact), and `preventDefault`s when handled.

---

## UI surface

### Pages

- `src/app/(dashboard)/layout.tsx` — NEW. Wraps `/dashboard/*` in
  `<NewLeadDialogProvider>` + `<CommandPalette>`. (Currently no
  dashboard layout; a route group `(dashboard)` exists but has no
  layout.tsx — D-008 introduces it.)
- `src/app/(dashboard)/dashboard/placeholder/[slug]/page.tsx` — NEW.
  Renders a forward-link banner for placeholder commands. The
  `slug` matches a known set defined in the catalog.
- `src/app/(dashboard)/dashboard/page.tsx` — modified to drop the
  inlined `<NewLeadDialog>` button (it's now reachable via the
  context-mounted dialog + Cmd+K). Keep the "+ New lead" button on
  the page for discoverability — wire its `onClick` to
  `openDialog()`.

### Components

- `src/components/cmdk/command-palette.tsx` — Client; the cmdk-driven
  modal. Listens for the hotkey, renders the catalog filtered by
  `visibleCommands`, dispatches via `dispatch.ts`.
- `src/components/cmdk/lookup-results.tsx` — Client; the inline
  sub-mode result list (debounced).
- `src/components/cmdk/use-cmdk-hotkey.ts` — hook (above).
- `src/components/cmdk/dispatch.ts` — action handler map (above).
- `src/components/dashboard/new-lead-dialog-context.tsx` — provider
  + hook (above).

### shadcn primitives

Reused: `Dialog`, `Button`, `Input`, `Label`. No new shadcn install.
The `cmdk` library is the new external dep.

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | First `cmdk` install. The library is small (~5KB gz) and React-19 compatible. | Lock to a known-good major; verify `npm run build` after install. |
| RQ-2 | Hotkey collision with browser default `Cmd+K` (focus address bar). | Capture at document level + `preventDefault` ONLY when not in an input/textarea, OR when the cmdk modal is already open (toggles). |
| RQ-3 | Cmd+K mounted in `(dashboard)/layout.tsx` only — does NOT cover `(admin)`/`(platform)`/`(settings)` in V0. | Documented out-of-scope; V1 hoists the provider to the root layout. Reviewer to confirm V0 scope. |
| RQ-4 | `searchLeads` ILIKE without trigram index — slow at very large lead counts. | V0 acceptable; D-014 adds `pg_trgm` index. The integration test asserts shape, not p95. |
| RQ-5 | Selecting a result mid-typing should NOT crash if the user has typed past the result list. | `cmdk`'s built-in keyboard navigation handles this; tested. |
| RQ-6 | Palette state resets when route changes — the user opens Cmd+K, navigates, expects palette closed. | The dispatch closes the palette before navigating. Asserted in unit + e2e. |
| RQ-7 | Toggle theme command requires a theme infrastructure. `next-themes` is in package.json but unused so far. | Use `next-themes`'s `useTheme` hook; mount `<ThemeProvider>` in the same dashboard layout. |
| RQ-8 | NewLeadDialog opening from Cmd+K vs from the dashboard's "+ New lead" button — both should work without state churn. | Single Provider holds the open state; both surfaces call `openDialog()`. |
| RQ-9 | Permission-gating uses `resolveForUser` which is server-side. The palette is a Client Component. | Server Component computes `visiblePerms` once and passes the resolved `Set<Permission>` (or the visible-command list) as a serialized prop to the Client palette. |
| RQ-10 | `searchLeads` is called from the browser via Server Action; the user could enumerate via guess-and-check. | RLS still scopes results by tenant; an attacker only sees their own org's leads. PII in `label` and `data.phone` is already visible to them via the canvas — no new exposure. |
