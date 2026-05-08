# Plan — 008-cmdk-bounded-catalog

## Files to be created

### Library

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/cmdk/types.ts` | 60 | `Command`, `CommandKind`, `CommandGroup`, `CommandId` derived |
| `src/lib/cmdk/catalog.ts` | 220 | The 30-command literal `as const`, grouped + permission-gated |
| `src/lib/cmdk/permissions.ts` | 50 | `visibleCommands(catalog, perms)` |
| `src/lib/cmdk/index.ts` | 15 | re-exports |

### Server actions

| File | Lines (~) | Purpose |
|---|---|---|
| `src/app/(dashboard)/dashboard/_actions/searchLeads.ts` | 100 | `searchLeads(query, limit?)` — RLS-scoped; ≤ 8 results |

### UI components

| File | Lines (~) | Purpose |
|---|---|---|
| `src/components/cmdk/command-palette.tsx` | 230 | cmdk-driven modal; hotkey listener; lookup-prefix sub-mode |
| `src/components/cmdk/lookup-results.tsx` | 100 | debounced result list for "Open lead by name…" |
| `src/components/cmdk/use-cmdk-hotkey.ts` | 50 | `useEffect` keydown listener (Cmd/Ctrl+K) |
| `src/components/cmdk/dispatch.ts` | 80 | action handler map (signOut, toggleTheme, openNewLeadDialog) |
| `src/components/cmdk/index.ts` | 15 | re-exports |
| `src/components/dashboard/new-lead-dialog-context.tsx` | 70 | `NewLeadDialogProvider` + `useNewLeadDialog` hook; renders the existing `<NewLeadDialog>` once |

### App-route changes

| File | Lines (~) | Purpose |
|---|---|---|
| `src/app/(dashboard)/layout.tsx` | 60 | NEW. Wraps in `NewLeadDialogProvider` + `<CommandPalette>` (resolved perms passed as serialized prop) + `<ThemeProvider>` from next-themes |
| `src/app/(dashboard)/dashboard/placeholder/[slug]/page.tsx` | 80 | NEW. Validates `slug` against a known set; renders banner |
| `src/app/(dashboard)/dashboard/page.tsx` | small | replace inline `<NewLeadDialog>` mount with a `<NewLeadDialogTrigger>` that calls `useNewLeadDialog().openDialog()` (the dialog itself moves into the layout's provider) |

### Tests

| File | Type | Lines (~) | Purpose |
|---|---|---|---|
| `tests/lib/cmdk/catalog.test.ts` | unit | 90 | catalog has exactly 30 commands; every `target` for navigate/placeholder commands matches an expected pattern; every `requires[]` permission is in `PERMISSIONS`; ids are unique |
| `tests/lib/cmdk/permissions.test.ts` | unit | 110 | `visibleCommands` matrix: super_admin / org_admin / sales_rep / channel_partner / read_only |
| `tests/app/dashboard/_actions/searchLeads.test.ts` | unit | 180 | mocked client: 401 unauth, 403 missing leads:view, validation (empty/too-long), happy path with limit, RLS isolation simulated by mock returning [] |
| `tests/components/cmdk/use-cmdk-hotkey.test.tsx` | unit | 110 | listener fires `onOpen` for Cmd+K + Ctrl+K; ignores when input/textarea is focused; preventDefault verified |
| `tests/components/cmdk/dispatch.test.ts` | unit | 90 | each handler invoked with the right ctx; signOut → router.push; toggleTheme writes data-theme |
| `tests/components/cmdk/command-palette.test.tsx` | unit | 220 | renders catalog (filtered by perms); typing filters; Enter activates; Esc closes; lookup sub-mode debounces + renders results; selecting a result navigates |
| `tests/components/cmdk/lookup-results.test.tsx` | unit | 100 | renders results; empty state; loading state |
| `tests/components/dashboard/new-lead-dialog-context.test.tsx` | unit | 80 | Provider + hook: openDialog/closeDialog drive open state; dialog mounts once |
| `tests/integration/cmdk-search-rls.test.ts` | integration | 200 | seed leads in 2 orgs; rep A queries → only Org A results; rep B queries → only Org B results; super_admin → 0 results |
| `tests/e2e/cmdk-open-and-navigate.spec.ts` | e2e @smoke | 90 | Cmd+K opens; type "dashboard"; Enter navigates to /dashboard; Esc closes |
| `tests/e2e/cmdk-lookup-lead.spec.ts` | e2e @smoke | 110 | seed lead; Cmd+K → "Open lead by name…" → type partial → result appears → Enter → land on canvas |

## Files to be modified

| File | Change |
|---|---|
| `package.json` | add `cmdk` (latest); `next-themes` already installed |
| `package-lock.json` | regenerated |
| `src/app/(dashboard)/dashboard/page.tsx` | use `useNewLeadDialog` for the "+ New lead" button (dialog itself moves to the provider) |
| `vitest.config.ts` | extend coverage `include` for cmdk paths |
| `memory/decisions.md` | append D-008.x entries (Group D) |
| `memory/learned/ai-crm/patterns.md` | append patterns (Group D) |

## Migrations

**None.**

## Tests (TDD order: RED → GREEN → REFACTOR per task)

1. **Catalog literal** + ID-uniqueness + targets (`catalog.test.ts`).
2. **Permission filter** matrix (`permissions.test.ts`).
3. **searchLeads server action** with mocked client.
4. **Hotkey hook** (`use-cmdk-hotkey.test.tsx`).
5. **Dispatch map** (`dispatch.test.ts`).
6. **NewLeadDialog provider** + hook.
7. **Command palette** integration RTL: render → filter → activate
   → lookup sub-mode → debounced result fetch → navigate.
8. **Layout mount + page wiring**.
9. **Placeholder route** (small RTL or via Playwright).
10. **Integration**: real-DB cross-tenant isolation for `searchLeads`.
11. **Playwright @smoke**: open + navigate, lookup-lead.

## Coverage estimate

- **Lines** ≥ 80% on `src/lib/cmdk/`,
  `src/components/cmdk/`,
  `src/app/(dashboard)/dashboard/_actions/searchLeads.ts`. Realistic ~ 90%.
- **Branches** ≥ 90%. Realistic ~ 92%. The hotkey hook has a few
  defensive branches (no-op when `e.target` is null) that should be
  fully covered by jsdom tests.
- **Stretch** — none planned.

## Risks (for Plan Mode reviewer)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P-1 | First `cmdk` library install. | Low | Lock major; verify build. |
| P-2 | Browser hotkey collision (Cmd+K = address bar). | Med | preventDefault only when not in input/textarea; document. |
| P-3 | New dashboard layout (`(dashboard)/layout.tsx`) might affect `/dashboard/leads/*` route resolution. | Low | Layout wraps existing pages; no route changes. |
| P-4 | Server Actions called from a Client Component (palette) — Next.js 16 nuance. | Low | Action returns a discriminated union; tested. |
| P-5 | Coverage on cmdk-internal animations / tab-key navigation may drift. | Low | The cmdk lib's own internals are excluded from our coverage scope. |
| P-6 | `next-themes` ThemeProvider not yet mounted; toggle command depends on it. | Low | Mount in the new `(dashboard)/layout.tsx`. |
| P-7 | If a placeholder slug from the catalog doesn't match `/dashboard/placeholder/[slug]` valid set, the route 404s. | Low | The page validates slugs against a known set; on miss → `notFound()`. Catalog test verifies parity. |
| P-8 | Stacked off `feature/007-lead-lifecycle`. PR retarget after D-007 merges. | Low | Same approach as D-007 → feature/006. |

## Out-of-scope reaffirmation

D-008 does NOT ship:

- Free-form NL search (V1 / D-008.1; depends on D-009 Model Gateway)
- Filtered list views as fully-featured tables (V1)
- Deal canvas / contact canvas (V1+)
- Site Visit canvas (D-012)
- Cmd+K mounted on `/admin/*`, `/platform/*`, `/settings/*` (V1
  hoists the provider to root)
- Recents / history / piped commands (V1)
- Voice input (never)
- Per-org custom catalog entries (V1+)
