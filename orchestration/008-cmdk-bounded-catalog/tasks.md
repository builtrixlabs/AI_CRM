# Tasks — 008-cmdk-bounded-catalog

Ordered for TDD execution. Estimated working sessions: **3-4**.

---

## Group A — library (catalog + types + permissions filter)

### A1. [setup] Install cmdk

- `npm install cmdk` (latest, React 19-compatible).
- `npm run build` ✓ as a smoke check before committing.

### A2. [unit] Command types

- `src/lib/cmdk/types.ts` — `Command`, `CommandKind`, `CommandGroup`,
  `CommandId` derived from the catalog literal.

### A3. [unit] Catalog literal (30 entries)

- `src/lib/cmdk/catalog.ts` — typed `as const` array.
- Test asserts: `length === 30`; ids unique;
  every `kind: 'navigate'` has a `target` starting with `/`;
  every `kind: 'placeholder'` has a `target` starting with
  `/dashboard/placeholder/`; every `requires[]` member is a valid
  `Permission`.

### A4. [unit] visibleCommands matrix

- `src/lib/cmdk/permissions.ts` — `visibleCommands(catalog, perms)`.
- Test seeds 5 role-typical permission sets and asserts each role
  sees the expected count + IDs (super_admin gets only the platform
  surface; sales_rep gets only operational; etc.).

### Commit checkpoint A

- [ ] All A tests pass; `npm run build` ✓.
- [ ] Commit: `feat(cmdk): catalog + types + visibleCommands (D-008 group A)`

---

## Group B — server action + hotkey hook + dispatch

### B1. [unit] searchLeads server action

- `src/app/(dashboard)/dashboard/_actions/searchLeads.ts` — auth
  + permission gate + Zod query validation + supabase ILIKE.
- Tests: 401 unauth, 403 missing `leads:view`, validation (empty +
  > 80 chars), happy path returns ≤ limit results, RLS-empty case.

### B2. [unit] useCmdkHotkey

- `src/components/cmdk/use-cmdk-hotkey.ts`.
- Tests (jsdom): Cmd+K fires `onOpen`; Ctrl+K fires; ignored when
  `<input>` or `<textarea>` is focused; `preventDefault` called.

### B3. [unit] dispatch map

- `src/components/cmdk/dispatch.ts` — handlers for `signOut`,
  `toggleTheme`, `openNewLeadDialog`.
- Tests: each handler invoked with the right ctx; toggleTheme writes
  data-theme + localStorage; signOut calls `supabase.auth.signOut`
  via injected client + router.push to `/auth/sign-in`.

### B4. [unit] NewLeadDialogProvider + useNewLeadDialog

- `src/components/dashboard/new-lead-dialog-context.tsx`.
- Tests: openDialog/closeDialog drive open state; dialog mounts
  ONCE within the Provider; `useNewLeadDialog` outside Provider
  throws (or returns sensible default).

### Commit checkpoint B

- [ ] All B tests pass.
- [ ] Commit: `feat(cmdk): search action + hotkey + dispatch + dialog provider (D-008 group B)`

---

## Group C — palette + lookup results

### C1. [unit] lookup-results

- `src/components/cmdk/lookup-results.tsx`.
- Tests: empty state ("Type to search…"); loading state; results
  render with label + state + phone; selecting one calls `onSelect`.

### C2. [unit] command-palette (the big one)

- `src/components/cmdk/command-palette.tsx`.
- Composition: cmdk root + input + list + groups + items;
  hotkey listener; lookup-prefix sub-mode.
- Tests:
  - Renders catalog filtered by `visiblePerms`.
  - Typing filters via cmdk's matcher.
  - Enter activates a `kind: 'navigate'` command → `router.push`
    with the target.
  - Enter on `kind: 'lookup-prefix'` enters sub-mode (input prefix
    becomes "Lead:"; subsequent keystrokes drive
    `searchLeads`).
  - Esc collapses sub-mode back to the catalog OR closes the modal
    (depending on state).
  - Selecting a lookup result navigates to `/dashboard/leads/<id>`
    and closes.
  - Backdrop click closes.
  - data-empty / data-state attributes for testability.

### Commit checkpoint C

- [ ] All C tests pass; `npm run build` ✓.
- [ ] Commit: `feat(cmdk): command palette + lookup results (D-008 group C)`

---

## Group D — wiring + integration + e2e + memory

### D1. [page] /dashboard placeholder route

- `src/app/(dashboard)/dashboard/placeholder/[slug]/page.tsx`.
- Validates `slug` ∈ known-set (defined in `src/lib/cmdk/catalog.ts`
  as `PLACEHOLDER_SLUGS`); else `notFound()`.

### D2. [layout] (dashboard) layout — mount palette + provider + theme

- `src/app/(dashboard)/layout.tsx`. Server Component:
  - Resolves user via `getCurrentUser`
  - Computes `visiblePerms` via `resolveForUser`
  - Wraps children in `NewLeadDialogProvider` + Client palette
    component (passes serialized `visiblePerms` array)
  - Mounts `next-themes`'s `<ThemeProvider>`.

### D3. [page] /dashboard/page.tsx — use the provider

- Replace inline `<NewLeadDialog />` with a `<NewLeadButton />`
  trigger client component that calls `useNewLeadDialog().openDialog()`.

### D4. [integration] cmdk-search-rls

- `tests/integration/cmdk-search-rls.test.ts` — seed leads in 2 orgs;
  rep A's `searchLeads("phone")` returns only Org A; rep B → only
  Org B; super_admin → 0.

### D5. [e2e@smoke] cmdk-open-and-navigate

- Playwright: sign in as sales_rep; press Ctrl+K; assert palette
  open; type "demo"; Enter → land on `/dashboard/leads/demo`.

### D6. [e2e@smoke] cmdk-lookup-lead

- Playwright: seed a lead; sign in; Cmd+K → "Open lead by name…"
  → type partial; result appears within 2s; Enter → canvas.

### D7. [doc] memory updates

- `memory/decisions.md` — D-008.1..D-008.x:
  - Bounded catalog at 30 commands (literal); free-form NL is V1
  - cmdk locked as the command-bar lib (PRD §6.3-binding)
  - Hotkey: preventDefault only when not in an input
  - Cmd+K mounted at `(dashboard)/layout.tsx` only in V0; root V1
  - searchLeads operational read NOT audited (Constitution VII)
  - NewLeadDialog open-state lifted to a Provider (D-007 → D-008
    refactor)
- `memory/learned/ai-crm/patterns.md`:
  - `bounded-command-catalog-literal`
  - `dialog-state-via-react-context-provider`
  - `permission-gated-command-visibility`
  - `lookup-prefix-submode-in-cmdk`

### D8. [verify] V5 Gate 4

- `npm run test`, `npm run test:integration`,
  `npm run test:smoke`, `npm run build`. Coverage ≥ 80 / ≥ 90.

### D9. [security] Gate 4 scan

- security-scanner agent run on the new files.

### D10. [deploy] preview

- Push triggers Vercel.

### D11. [merge] PR

- `gh pr create --base feature/007-lead-lifecycle
   --head feature/008-cmdk-bounded-catalog` (stacked).
- Retarget to `v1` after D-006 + D-007 merge train clears.

---

## Commit cadence

| Checkpoint | Commit message |
|---|---|
| A | `feat(cmdk): catalog + types + visibleCommands (D-008 group A)` |
| B | `feat(cmdk): search action + hotkey + dispatch + dialog provider (D-008 group B)` |
| C | `feat(cmdk): command palette + lookup results (D-008 group C)` |
| D | `feat(cmdk): layout wiring + integration + e2e + memory (D-008 group D)` |

Final PR title: `feat: D-008 Cmd+K bounded catalog (30 commands + lookup)`

---

## Reviewer questions for Plan Mode

1. **30-command catalog scope.** Final list: ~9 navigation, ~10 leads,
   ~5 operations, ~4 account, ~2 help. Reviewer confirms or trims.
2. **`cmdk` library** as the locked command-bar implementation per
   PRD §6.3. OK?
3. **Cmd+K only on `(dashboard)/*` in V0** — not on
   `(admin)/*`, `(platform)/*`, `(settings)/*`. V1 hoists. OK?
4. **NewLeadDialog open-state via React Context Provider** vs an
   event bus. Plan picks Provider (typed, React-idiomatic). OK?
5. **Placeholder commands navigate to a `/dashboard/placeholder/<slug>`
   stub route** (not toast). Stub validates slug against known set.
   Same precedent as D-005's placeholder cards. OK?
6. **Permission-gating: hide, not disable.** OK.
7. **`searchLeads` is RLS-scoped via the request-scoped server
   client** — no service-role for D-008 reads. Same posture as
   D-006's `getLeadCanvas`. OK?
8. **No `read_sensitive` audit on lookup search** — operational-tier
   read by the workspace's own user. Same precedent as D-004.4 / D-006.4. OK?
9. **Hotkey preventDefault only when NOT in input/textarea.**
   Preserves editing UX. OK?
10. **Free-form NL is V1 (D-008.1).** D-008 stays bounded. OK?
