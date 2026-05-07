# Tasks — 005-org-admin-onboarding

Ordered for TDD execution. Estimated working sessions: **3-4**.

---

## Group A — schema + library

### A1. [migration] organizations.branding column

- `supabase/migrations/20260507160000_organizations_branding.sql`. Apply via `supabase db push`.

### A2. [unit] step IDs + hard-gate set

- Tests assert `STEP_IDS.length === 8`, hard-gated set has exactly `org_details` + `first_workspace`.

### A3. [unit] onboardingStateSchema + getOnboardingState

- Tests: empty payload defaults; rejects bad shape; `getOnboardingState` returns parsed default for an org with empty `onboarding_state`.

### A4. [unit] advanceStep — happy path per step

- For each of the 8 steps, a test seeds the prior state, calls `advanceStep` with a valid payload, and asserts `current_step` advanced + `completed_steps` appended + audit row written.

### A5. [unit] advanceStep — hard-gate skip rejected

- Calling with `step='org_details'` + `skipped=true` → `OnboardingHardGateError`.
- Same for `first_workspace`.

### A6. [unit] advanceStep — completion sets completed=true

- After step 8 completes, `onboarding_state.completed === true` and `current_step === 'completed'`.

### A7. [unit] cockpit.ts shape

- Mocked supabase: `getCockpitData(org_id)` returns the typed shape with non-null counts.

### Commit checkpoint A

- [ ] All A tests pass.
- [ ] Commit: `feat(admin): onboarding state machine + cockpit data fetcher (D-005 group A)`

---

## Group B — wizard server actions

### B1. [unit] action: org_details

- Tests: action validates payload, calls `advanceStep`, returns redirect-state on success; rejects bad email; rejects skip.

### B2-B7. [unit] actions: branding, first_workspace, lead_sources, pipeline_stages, team_users, integrations

- One test per action covering happy + at-least-one-failure mode.

### B8. [unit] action: sample_demo

- Marks step completed; never touches `nodes` / `audit_log` for fictional data (only the wizard-completion audit row).

### Commit checkpoint B

- [ ] All B tests pass.
- [ ] Commit: `feat(admin): wizard server actions (D-005 group B)`

---

## Group C — pages + cockpit + step components

### C1. [page] /admin layout + cockpit (page.tsx)

- 3 rows × 4 cards. Subscription card uses live data; usage card uses live counts; the rest are placeholders that link forward.

### C2. [page] onboarding banner

- Above the cards when `!cockpit.onboarding.completed`. Dismissable via `localStorage.setItem('onboarding-dismissed', '1')` (purely UI; banner reappears on refresh — V0 simple).

### C3. [page] /admin/onboarding wizard

- Reads current state, renders the matching step component, hooks Back/Skip/Next/Finish to the actions. Wizard chrome shows step indicator (1 / 8 etc).

### C4. [steps 1-8] eight tiny client components

- Each renders the form fields + submit button. Step 8 is a "Click through Lead → Qualified → Site Visit → Booked" demo with fixture data only.

### C5. [pages] forward placeholder targets

- `/admin/dashboards`, `/admin/tables`, `/admin/agents`, `/admin/directives`, `/settings/users`, `/settings/integrations` — 6 placeholder pages.

### C6. [integration] full wizard walk against real DB

- Seed an org + org_admin; call advanceStep 8 times via the helper; assert org row updated (steps 1, 3), onboarding_state has correct shape (steps 2, 4, 5, 6, 7), audit_log has 8 rows.

### C7. [integration] admin-routes-rls

- Two orgs with one org_admin each; admin A reading `getCockpitData(orgB)` (passing the wrong org_id) → returns counts only for orgA via app_org_id() (since the function doesn't accept an arbitrary org_id; it derives from the caller).

### Commit checkpoint C

- [ ] `npm run build` ✓; full test suite green.
- [ ] Commit: `feat(admin): cockpit + 8-step onboarding wizard pages (D-005 group C)`

---

## Group D — Memory + verify + PR

### D1. [doc] memory updates

- decisions.md: D-005.1 wizard step IDs as literal union; D-005.2 hard-gate enforcement at advanceStep (not just UI); D-005.3 sample-demo writes no DB rows; D-005.4 `branding` jsonb instead of separate columns.
- patterns.md: `wizard-state-machine-via-jsonb`, `hard-gate-as-error-class`.

### D2. [verify] V5 Gate 4

- `npm run test`, `npm run test:integration`, `npm run build`.

### D3. [deploy] preview

- Push triggers Vercel; existing env covers D-005.

### D4. [merge] PR

- `gh pr create --base v1 --head feature/005-org-admin-onboarding`.

---

## Commit cadence

| Checkpoint | Commit message |
|---|---|
| A | `feat(admin): onboarding state machine + cockpit data fetcher (D-005 group A)` |
| B | `feat(admin): wizard server actions (D-005 group B)` |
| C | `feat(admin): cockpit + 8-step onboarding wizard pages (D-005 group C)` |
| D | `doc: D-005 decisions + patterns; verify (D-005 group D)` |

Final PR title: `feat: D-005 org_admin cockpit + onboarding wizard`

---

## Reviewer questions for Plan Mode

1. **Step persistence split.** Steps 1, 3 update existing tables (organizations, workspaces); steps 2, 4, 5, 7 store in `onboarding_state` jsonb; step 6 invites users (real `profiles` rows); step 8 is purely UI. OK or want everything in jsonb until V1?
2. **`branding` as jsonb vs split columns.** Plan: `jsonb DEFAULT '{}'`. OK to defer DB-side validation to Zod?
3. **Pipeline stages fixed in V0.** User can confirm but not customise. Customisation lands in D-007 lead lifecycle. OK?
4. **Step 6 invites cap = 3.** Hard-coded for V0. OK?
5. **Sample demo writes no rows.** Visual walk-through only. OK?
6. **Cockpit cards as 3-row grid (12 cards).** Constitution IX-friendly. OK or want an alternate layout?
