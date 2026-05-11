# Directive 421 — Booking Pipeline: Stage Machine + Canvas Tracker

**Kind:** feature (V4 / V1-phase PRD §P5 — first of 4 slices)
**Status:** PENDING — drafted 2026-05-11; awaits Gate 2 Plan Mode
**Branch target:** `v4` (feature branch `feature/421-booking-pipeline-stage-machine`)
**Authority anchor:** `baseline/118-booking-pipeline-contract.md` §3, §4, §5, §9, §10
**Builds on:**
- D-410 (Deal canvas + Deals list)
- D-413 (Custom views engine)
- Constitution III (provenance) + IV (audit)
**Followed by:** D-422 (payment milestones), D-423 (demand letter PDF), D-424 (event emissions)

---

## Problem

PRD v3.0 §P5 requires the deal canvas to track the full post-EOI lifecycle across 8 stages (EOI → Handover Complete), with audit-logged transitions, role-gated rollbacks, and a visible stage history. Today the `deals` table has no stage field; the deal canvas shows attributes but no lifecycle state. The booking pipeline is the canonical sales motion for real estate — without it, the deal canvas is a contact directory in disguise.

D-421 ships the foundational slice: stage enum + transition audit table + the RPC that enforces the matrix from baseline 118 §4, plus a canvas widget that renders the 8-stage stepper with the current stage highlighted and a chronological history strip. Payment milestones, demand-letter PDFs, and outbound event emissions are deliberately deferred to D-422, D-423, D-424 — each is independently shippable on top of this slice.

## Success criteria

### Schema (baseline 118 §3 + §5)

- [ ] **AC-1** Migration `supabase/migrations/<ts>_booking_pipeline_stage_machine.sql` adds:
  - `deal_stage` enum (8 values exactly as baseline §3)
  - `deals.current_stage deal_stage NOT NULL DEFAULT 'eoi'` (backfill: every existing deal → `'eoi'`)
  - `stage_transitions` table per baseline §5 (full column list, FK to `organizations` + `deals` + `users`, `UNIQUE (deal_id, idempotency_key)`, index on `(organization_id, deal_id, occurred_at DESC)`)
  - One initial `stage_transitions` row per existing deal: `from_stage=NULL, to_stage='eoi', actor_kind='system', triggered_by='migration:20260511', evidence='{"backfill": true}', idempotency_key=gen_random_uuid()`
- [ ] **AC-2** Migration is additive-only (no DROP, no destructive ALTER on existing columns). The file's tail includes a commented-out rollback DDL block that drops the new objects in reverse FK order.
- [ ] **AC-3** Migration applied to live Supabase via `node scripts/apply_migration.mjs supabase/migrations/<file>.sql` (CLAUDE.md V4 gate 4). Post-apply, `node scripts/verify_421.mjs` confirms:
  - `deal_stage` enum exists with the 8 expected values in order
  - `deals.current_stage` exists, is NOT NULL, defaults to `'eoi'`
  - `stage_transitions` table exists with RLS enabled
  - Backfill row count in `stage_transitions` = `(SELECT count(*) FROM deals)`
  - `transition_stage` function exists, is SECURITY DEFINER, has EXECUTE granted to `authenticated`

### RLS (baseline 118 §9)

- [ ] **AC-4** RLS policies on `stage_transitions`:
  - `SELECT`: `organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())` (or equivalent existing helper)
  - `INSERT`, `UPDATE`, `DELETE`: DENY (no direct policy grants `true`)
- [ ] **AC-5** RLS enabled (`ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY`).

### RPC — `transition_stage` (baseline 118 §4 + §9)

- [ ] **AC-6** Postgres function:
  ```
  transition_stage(
    p_deal_id uuid,
    p_to_stage deal_stage,
    p_idempotency_key uuid,
    p_evidence jsonb DEFAULT '{}'::jsonb,
    p_skip_reason text DEFAULT NULL,
    p_correction_reason text DEFAULT NULL
  ) RETURNS uuid
  ```
  Behavior:
  - Acquires `SELECT ... FOR UPDATE` on the target `deals` row.
  - Derives `organization_id` from the deal row (NOT from a parameter — prevents cross-org transitions).
  - Verifies `auth.uid()` is a member of that organization; else RAISE `'access_denied'`.
  - Validates the transition against baseline §4:
    - Forward by one ordinal: allowed
    - `eoi → booking` with `p_skip_reason='cash_buyer'`: allowed
    - `sale_agreement → registration` with `p_skip_reason='fully_cashed'`: allowed
    - Backward by one ordinal: allowed only if caller has `agent_org_admin` role AND `p_correction_reason` is non-NULL and non-empty
    - All other transitions: RAISE EXCEPTION `'invalid_transition'`
  - Validates provenance: `p_evidence != '{}'::jsonb` else RAISE `'no_provenance'`. (DOE-triggered transitions in future directives will carry their own provenance path; D-421 only exercises the manual path.)
  - Idempotency: if `(p_deal_id, p_idempotency_key)` already exists in `stage_transitions`, RETURN that row's id without writing.
  - Writes `stage_transitions` row with `actor_user_id = auth.uid()`, `actor_kind = 'user'`, `triggered_by = 'manual'`.
  - Updates `deals.current_stage = p_to_stage`.
  - Returns the new (or existing-for-idempotency) `stage_transitions.id`.
- [ ] **AC-7** Function is `SECURITY DEFINER` with `SET search_path = public, pg_temp`. `REVOKE ALL ... FROM public`. `GRANT EXECUTE ... TO authenticated`.

### Server actions / types

- [ ] **AC-8** `src/lib/booking/stages.ts` (new):
  - Exports `DEAL_STAGES` as a const tuple `['eoi','token','booking','sale_agreement','loan_finance','registration','possession','handover_complete'] as const`.
  - Exports `DealStage = typeof DEAL_STAGES[number]`.
  - Exports `STAGE_LABEL: Record<DealStage, string>` and `STAGE_ORDINAL: Record<DealStage, number>`.
  - Exports `isForwardTransition(from, to, skipReason?): boolean` and `isBackwardCorrection(from, to): boolean` — client-side mirror of the RPC matrix, used to drive UI affordances (NOT trust-bearing; server is the gate).
- [ ] **AC-9** Server action `transitionDealStage(dealId: string, toStage: DealStage, options?: { evidence?: Record<string, unknown>; skipReason?: string; correctionReason?: string }): Promise<{ transitionId: string }>` in `src/app/(app)/deals/[id]/actions.ts`:
  - Generates a fresh UUIDv4 `idempotency_key` per call.
  - Calls `transition_stage` RPC via the user-scoped Supabase client.
  - Maps RPC errors `'invalid_transition'`, `'no_provenance'`, `'access_denied'` to typed errors.
- [ ] **AC-10** Server action `listStageTransitions(dealId: string): Promise<StageTransition[]>` returns transitions for a deal ordered `occurred_at DESC`, RLS-scoped.

### Canvas widget — `<DealStageTracker />`

- [ ] **AC-11** New component `src/components/canvas/deal-stage-tracker.tsx`:
  - Props: `{ dealId: string; currentStage: DealStage; transitions: StageTransition[]; userRole: 'agent_org_admin' | 'agent_org_user' | 'agent_super_admin' | ... }`
  - Renders the 8 stages as a horizontal stepper (eoi, token, booking, sale_agreement, loan_finance, registration, possession, handover_complete).
  - Highlights current stage; stages before current shown as completed (filled); stages after as upcoming (outlined).
  - Below the stepper: a chronological history strip (most recent first) showing `from → to` + actor name + relative timestamp (`x minutes ago`) + evidence preview (first 60 chars of `JSON.stringify(evidence)`).
  - Forward-transition button: opens a `Dialog` with target-stage selector (only stages allowed per `isForwardTransition`) + evidence textarea (validates as JSON before submit) + optional skip-reason dropdown when relevant.
  - Backward correction button: rendered only when `userRole === 'agent_org_admin'`. Opens a `Dialog` with a single-step-back target + `correction_reason` textarea (required, non-empty).
- [ ] **AC-12** Wired into the existing Deal canvas at `src/app/(app)/deals/[id]/page.tsx` between the deal header and the activity stream. Loads `transitions` via `listStageTransitions` server action.

### Tests

- [ ] **AC-13** Unit tests `tests/booking/transition-stage.test.ts` (Vitest against a Postgres test branch via `mcp__vibe-supabase__apply_migration_to_branch`):
  - Forward by one (e.g. `eoi → token`): succeeds, writes row, updates `current_stage`.
  - Forward by two (e.g. `eoi → booking` without `skip_reason`): raises `invalid_transition`.
  - `eoi → booking` with `skip_reason='cash_buyer'`: succeeds.
  - `sale_agreement → registration` with `skip_reason='fully_cashed'`: succeeds.
  - Backward by one as `agent_org_admin` + `correction_reason`: succeeds.
  - Backward by one as `agent_org_user` (non-admin): raises `invalid_transition`.
  - Empty `evidence` ({}) + no `doe:` trigger path: raises `no_provenance`.
  - Same `idempotency_key` twice: second call returns first row id, second row NOT written (count unchanged).
  - Cross-org attempt (user in org A, deal in org B): raises `access_denied`.
- [ ] **AC-14** RTL test `tests/components/deal-stage-tracker.test.tsx`:
  - 8 stages render; current stage visually distinct (data-testid or aria-current).
  - History strip renders in correct order with at least the most recent transition's `from → to` text.
  - Forward button opens dialog; submission calls server action with correct `(dealId, toStage, { evidence })`.
  - Backward button absent for `agent_org_user`; present for `agent_org_admin`.
- [ ] **AC-15** Coverage on touched files ≥ 80% lines / ≥ 90% branches (V5 D-06).
- [ ] **AC-16** All new tests run green in `npx vitest run tests/booking tests/components/deal-stage-tracker.test.tsx`.

### Verification on live preview (CLAUDE.md V4 gates 6 + 7)

- [ ] **AC-17** Vercel preview deploy on `feature/421-booking-pipeline-stage-machine` reaches `READY` via `mcp__vibe-vercel__wait_for_preview`. On `ERROR`, read deploy logs, fix, redeploy.
- [ ] **AC-18** Operator (or agent via `mcp__Claude_in_Chrome__*` / `mcp__Claude_Preview__*`) navigates to a seeded deal, sees the stage tracker, transitions `eoi → token` with evidence `{"receipt_no": "TEST-001", "amount_inr": 100000}`, observes:
  - Stepper advances visually
  - History strip updates with the new entry on top
  - A new row appears in `stage_transitions` via Supabase Studio (or a `verify_421.mjs --post-ui` extension)

### Status logging (CLAUDE.md V4 gate 10)

- [ ] **AC-19** `docs/V4_STATUS.md` D-121 row updated from `planned` → `partial (D-421 shipped — stage machine; D-422/D-423/D-424 pending)`, with migration filename + PR # + preview URL.
- [ ] **AC-20** Schema-changes table in V4_STATUS §5 appended with the new migration row.
- [ ] **AC-21** Test-counts table in V4_STATUS §6 appended with the D-421 test delta.

## Non-goals (D-421)

- Payment milestones / outstanding balance → **D-422**.
- Demand letter PDF rendering → **D-423**.
- Outbound event emissions to PSCRM / Legal Auditor → **D-424**.
- Stage-aware DOE directives (e.g. auto-generate demand letter on `loan_finance → registration`) → follow-up after D-422 + D-423 land.
- Agent / system-actor transitions (column reserved per baseline §5 but only `user` actor exercised in D-421; agent path lands with D-115 / D-116).
- Bulk re-stage operations.
- Stage-based deal filtering on the Deals list — handled by existing D-410 list + D-413 custom-views engine consuming `deals.current_stage` as a regular column; D-421 just exposes the column.

## Stack

- Postgres enum + table + SECURITY DEFINER RPC.
- `@supabase/supabase-js` from server actions (existing pattern).
- React canvas pattern from D-410 (shadcn `Card` + `Badge` + composed stepper; no new shadcn install required).
- No new npm dependencies.

## Files (expected)

| Path | Action |
|---|---|
| `supabase/migrations/<ts>_booking_pipeline_stage_machine.sql` | new |
| `scripts/verify_421.mjs` | new |
| `src/lib/booking/stages.ts` | new |
| `src/lib/booking/transitions.ts` | new |
| `src/app/(app)/deals/[id]/actions.ts` | new or extend |
| `src/components/canvas/deal-stage-tracker.tsx` | new |
| `src/app/(app)/deals/[id]/page.tsx` | extend (mount widget) |
| `tests/booking/transition-stage.test.ts` | new |
| `tests/components/deal-stage-tracker.test.tsx` | new |
| `docs/V4_STATUS.md` | extend (status row + schema row + test count) |

## Acceptance against V4 10-gate stopping criteria

| Gate | How it passes |
|---|---|
| 1 Built | ACs 1–12 have code |
| 2 Tested | ACs 13–16 green via targeted vitest run |
| 3 Typechecked | `npx tsc --noEmit` clean on changed files |
| 4 Migrations applied | AC-3 — `apply_migration.mjs` + `verify_421.mjs` both succeed against live Supabase |
| 5 Pushed | `feature/421-booking-pipeline-stage-machine` on `origin`; PR opened against `v4` |
| 6 Vercel preview green | AC-17 — `wait_for_preview` returns `READY` |
| 7 UI verified | AC-18 — screenshot + interaction flow recorded |
| 8 Merged | `gh pr merge --squash --delete-branch` after gates 1–7 |
| 9 Post-merge v4 green | `wait_for_preview --branch v4` returns `READY` |
| 10 Status logged | ACs 19–21 — `docs/V4_STATUS.md` updated |

---

*End of D-421.*
