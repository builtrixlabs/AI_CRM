# Directive 008 — Cmd+K bounded catalog

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-008 + docs/PRD.md §6.2 (C6) + §6.3 + Constitution IX
**Authority:** memory/constitution.md (Principles II tenant isolation, IX Canvas/Cmd+K-as-OS, X NL-Compile-Then-Apply)
**Builds on:** D-001 (middleware + RBAC), D-002 (nodes API), D-003 (permissions), D-006 (Lead canvas), D-007 (lead lifecycle + NewLeadDialog)
**Stack:** branched off `feature/007-lead-lifecycle` (stacked PR; will rebase to `v1` after D-006 → D-007 merge train clears).

---

## Problem

Constitution IX names **Cmd+K as the OS**: every navigation, query,
and action the user might take should be reachable from a single
command bar. PRD §6.3 names the `cmdk` library as the implementation.
PRD §6.2 row C6 is binding: "Every navigation, query, and action
accessible from a single command bar."

The previous directives shipped surfaces (cockpit, canvas, lifecycle)
but each requires the user to know where to click. There's no central
"do anything" affordance. D-008 ships **Cmd+K** with a **bounded V0
catalog** — 30 commands covering navigation, common filters, the
lookup-by-name flow for leads, and a few placeholder commands that
forward to surfaces planned for later directives.

**No free-form NL in V0.** The catalog is a finite literal list with
typed metadata. Free-form NL ("show me hot leads in Whitefield with
budget > 2 Cr") is the **D-008.1 → V1** roadmap; D-008 stays bounded.
This is also Constitution X — NL-Compile-Then-Apply's "compile" step
is a future directive's domain (Model Gateway D-009 + DOE D-011).

D-008 ships:

1. **`<CommandPalette>`** — a global modal mounted in the dashboard
   layout, open via `Cmd+K` / `Ctrl+K`, closed via `Esc` or
   click-outside. Built on the `cmdk` library + shadcn/ui primitives
   (Dialog already present, Input/Button reused).
2. **Catalog literal** — `src/lib/cmdk/catalog.ts` — a typed `as const`
   array of 30 commands. Each entry: `{ id, label, kind, target?,
   icon?, requires?: Permission[], hint?: string }`. Permission-gated
   per the user's resolved permission set (D-003).
3. **Lookup commands** — "Open lead by name…" runs a debounced
   server action `searchLeads(query, limit=8)` that returns up to 8
   results scoped by RLS to the caller's tenant. Selecting a result
   navigates to `/dashboard/leads/<id>`.
4. **Placeholder commands** — for surfaces not yet built (filtered
   list views, deal canvas, contact canvas, site visits), the command
   navigates to a small placeholder page or surfaces an info toast
   "lands in D-XXX" — same pattern D-005 / D-006 used for forward-
   looking placeholder cards.
5. **Performance budget** — p95 first-keystroke-to-first-result <
   300ms on the Vercel preview. Static commands resolve client-side
   (instant). Lookup commands debounce 200ms + hit one indexed
   `nodes` SELECT (label ILIKE) under RLS.

---

## Success criteria

### Open / close / keyboard

- [ ] **AC-1** Pressing `Cmd+K` (macOS) or `Ctrl+K` (Linux/Windows)
      from any `/dashboard`, `/admin`, `/platform`, or `/settings`
      route opens the palette. The shortcut is captured at the
      document level so it works regardless of focused element.
- [ ] **AC-2** Pressing `Esc` closes the palette and returns focus
      to the previously-focused element.
- [ ] **AC-3** Clicking the backdrop closes the palette.
- [ ] **AC-4** The palette opens with the search input focused.

### Catalog rendering

- [ ] **AC-5** With an empty input, the palette shows up to **30**
      commands grouped by `group` (Navigation, Leads, Operations,
      Account, Help). Order within each group is stable (defined by
      the catalog literal).
- [ ] **AC-6** Typing filters commands fuzzy-style via `cmdk`'s
      built-in matcher; arrow-keys move selection; Enter activates
      the highlighted command.
- [ ] **AC-7** A command whose `requires` permissions are not held
      by the current user is hidden from the palette (no spinner,
      no disabled state — just absent). Resolved via `resolveForUser`
      and cached per session in the parent component.
- [ ] **AC-8** The palette renders the user's accessible commands
      only; `super_admin` does not see operational commands;
      `sales_rep` does not see platform commands; etc. Verified by
      role-matrix unit tests.

### Navigation commands

- [ ] **AC-9** Selecting a `kind: 'navigate'` command pushes the
      target URL via `router.push` and closes the palette.
- [ ] **AC-10** The catalog includes navigation commands for every
      built surface (Dashboard, Demo lead, Admin cockpit, Onboarding,
      Audit log, Platform — gated appropriately).

### Action commands

- [ ] **AC-11** "Create new lead" command opens the existing
      `<NewLeadDialog>` from D-007 (router-level state lift, OR a
      shared event bus — see Plan Mode discussion). This command
      requires `leads:create`.
- [ ] **AC-12** "Toggle theme" command writes a `data-theme` attr on
      `<html>` and persists to `localStorage`. (No backend.)
- [ ] **AC-13** "Sign out" command calls `supabase.auth.signOut()`
      and redirects to `/auth/sign-in`. No confirmation dialog —
      Esc is the abort.

### Lookup commands

- [ ] **AC-14** "Open lead by name…" reveals an inline lookup
      sub-mode: keystrokes after this command fire a 200ms-debounced
      `searchLeads` server action; results render up to 8 leads
      (label + state badge + first-line of data.phone).
- [ ] **AC-15** `searchLeads` is RLS-scoped to the caller's tenant.
      Implementation: server action calls a request-scoped server
      client and runs `nodes SELECT WHERE node_type='lead' AND
      deleted_at IS NULL AND (label ILIKE %q% OR data->>'phone'
      ILIKE %q%)` with a `LIMIT 8` and `ORDER BY updated_at DESC`.
- [ ] **AC-16** Selecting a result navigates to
      `/dashboard/leads/<id>` and closes the palette.
- [ ] **AC-17** A user in workspace `W'` (different tenant) gets 0
      results when querying for a lead in tenant `W`. Verified
      against the live DB in an integration test.

### Placeholder commands

- [ ] **AC-18** "Show hot leads", "Show today's site visits",
      "Open deal by name…", "Open contact by name…" navigate to a
      small placeholder route (e.g. `/dashboard/leads?cmdk=hot`)
      that renders a banner "Filtered list / canvas lands in
      D-XXX." No-op functionally; the command is discoverable now
      so muscle memory is built.

### Performance

- [ ] **AC-19** First-keystroke-to-first-result p95 < 300ms on the
      Vercel preview. Static commands are instant (client-side
      cmdk fuzzy match); lookup commands debounce 200ms + a single
      indexed SELECT. D-014 hardens the budget; D-008 instruments
      it via a Playwright test that asserts result render under
      500ms (looser than 300ms for CI flakiness margin).

### Quality gates

- [ ] **AC-20** All untagged tests pass; D-001 → D-007 suites
      remain green.
- [ ] **AC-21** Coverage ≥ 80 lines / ≥ 90 branches on
      `src/lib/cmdk/`, `src/components/cmdk/`, and the
      `searchLeads` server action.
- [ ] **AC-22** `npm run build` ✓.

---

## Constraints

- **Constitution IX (no tabs).** Cmd+K is a modal command bar, not a
  tab. The palette has internal "groups" (Navigation, Leads, …) but
  these are list-section headers, not tabs.
- **Constitution VII stack discipline.** `cmdk` library (PRD §6.3
  named); shadcn/ui Dialog primitive (already in repo from D-001).
  No new motion library. Keyboard shortcut handling via a single
  `document.addEventListener('keydown')` in a `useEffect` — no
  third-party hotkey lib.
- **Constitution II tenant isolation.** `searchLeads` uses the
  request-scoped server Supabase client (NOT service role); RLS
  scopes by `auth.app_org_id()` — same posture as `getLeadCanvas`
  in D-006. **No service-role mutations or reads in D-008.**
- **Constitution X NL-Compile-Then-Apply.** D-008 is bounded
  (catalog literal). Free-form NL is the domain of D-009 (Model
  Gateway) + D-011 (DOE engine). The catalog is the "compiled
  artifact"; free-form NL would compile NL → catalog-id. That's V1.
- **Permission-gating** on every command — no "see-but-not-allowed"
  affordances. Resolution via `resolveForUser`, cached at the
  palette parent component (one resolve per session).
- **TDD per task** (V5 D-06).
- **No new shadcn install** beyond what's already in the repo. cmdk
  is a separate npm package (not shadcn-managed).

---

## Out of scope (explicit non-goals)

- **Free-form NL search** ("show me hot leads in Whitefield" parsed
  by an LLM) — V1 / D-008.1, depends on D-009 Model Gateway.
- **Filtered list views** (`/dashboard/leads?state=new&intent_score_gte=70`
  rendered as a table) — V1. D-008 ships placeholder routes only.
- **Deal canvas / contact canvas** — V1 / V1+. D-008 ships
  "Open deal/contact by name…" as discoverable placeholders.
- **Site Visit canvas** — D-012 (Site Visit + Calendar).
- **Cross-canvas pan/zoom** ("canvas-of-canvases" Manager view) — V1.
- **Custom catalog entries** authored by org admins — V1+ (depends on
  L3 customisation per Constitution XI).
- **Cmd+K command history / recents** — V1.
- **Voice input** — never (out of scope for the product).
- **NL-aware autocomplete** ("did you mean…?") — V1.
- **Multi-step / piped commands** ("show hot leads → call them") — V1+.
- **Mobile keyboard equivalent** (long-press, swipe) — V1.
- **Per-org branded labels** in the catalog — V1.

---

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md`:

- **permission-catalog-as-literal-union** (D-003) — the command
  catalog uses the same `as const` literal pattern. Each command
  ID is a member of a union; downstream code (tests, telemetry)
  picks up new commands at compile time.
- **tenant-isolation-via-jwt-claim** (D-001) — `searchLeads`
  routes through the request-scoped server client; RLS scopes
  results by `auth.app_org_id()`.
- **injectable-supabase-client-for-tests** (D-001/D-006) —
  `searchLeads(query, opts, client?)` accepts an optional client
  for unit tests.
- **slot-contract-with-empty-state-default** (D-006) — placeholder
  commands navigate to a small page that renders an empty-state
  card forwarding to the future directive.
- **server-action-result-discriminated-union** (D-007) —
  `searchLeads` returns a typed result so the palette renders
  errors inline rather than throwing across the RSC boundary.
- **state-machine-as-pure-record** (D-007) — the catalog's
  `kind: 'navigate' | 'action' | 'lookup-prefix' | 'placeholder'`
  is the same shape: a discriminator + per-kind handler in the
  palette dispatch.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/008-cmdk-bounded-catalog/`.
- Estimate: **M** — 1 npm dep (`cmdk`), ~10 new files (catalog,
  command palette, hotkey hook, search action, placeholder route,
  layout mount), ~6 test files, 1 integration, 2 Playwright @smoke.
  3-4 sessions.
- Reviewer should confirm:
  1. **Bounded catalog at 30 commands.** Locked literal; new
     commands need a directive amendment OR are deferred to V1's
     custom catalog system. OK?
  2. **`cmdk` dep install.** First instance of `cmdk` in the repo.
     ~5KB gz. PRD-mandated.
  3. **NewLeadDialog open-from-Cmd+K.** Plan: lift the dialog's
     open state into a context (or use a tiny event bus). The
     dialog component stays in `src/components/dashboard/` but
     a `<NewLeadDialogProvider>` wraps it so any component
     (including the palette) can call `openNewLeadDialog()`.
     OK or prefer a different lifting pattern?
  4. **"Open lead by name…" inline sub-mode.** Plan: when this
     command is selected, the palette stays open, the input
     prefix becomes "Lead:" and subsequent keystrokes drive the
     debounced server-action search. Esc collapses back to the
     full catalog. OK?
  5. **Placeholder commands navigate to a stub route** (e.g.
     `/dashboard/leads?cmdk=hot`) rather than surfacing a toast.
     Trade-off: stub route adds 1 page; toast adds 1 dependency.
     Plan picks the stub route for consistency with D-005's
     placeholder pattern.
  6. **Permission-gated visibility, not disabled-but-visible.**
     Per CSI Conf D-001 (the original RBAC pattern). OK.
  7. **No `read_sensitive` audit on lookup search.** Operational-
     tier read by the workspace's own user — same precedent as
     D-004.4 / D-006.4. The lookup is bounded to ≤ 8 rows + label
     fields; not sensitive enough to merit per-search audit.
  8. **Hotkey conflict handling.** Browser default for Cmd+K is
     "focus address bar" on Chrome/Edge but "search history" on
     Firefox. We `preventDefault` only when an `<input>`/`<textarea>`
     is NOT focused, OR when the modifier key is held — keeps
     editing UX intact. OK?
  9. **Lookup performance: debounce 200ms, LIMIT 8, ORDER BY
     updated_at DESC.** No vector / pgvector — V0 uses ILIKE.
     Semantic search lands with D-009 + the nodes embedding
     index (already created in D-002).
