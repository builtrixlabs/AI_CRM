# Directive 602 — Site Visit Module (list · detail · coordinator · status workflow)

**Kind:** feature (V6 Phase 1, step 1.5 — first-class Site Visits surface)
**Status:** AUTHORIZED — operator cleared Phase 1 to run end-to-end 2026-05-14 ("implement all these features without stopping … completing phase 1")
**Branch target:** `v6-phase-1`
**Generated:** 2026-05-14T09:05:00Z
**Source:** `docs/PRD-v6.0.md` §D-602 (lines 288-330); `docs/plans/v6-implementation-order.md` §3 + §4 step 1.5.
**Builds on:** D-002 (graph data model — site visits are `nodes`, `node_type='site_visit'`), D-012 (`src/lib/sitevisits/*` — `createSiteVisit`, `transitionSiteVisit`, reminder agent), D-222 (cockpit calendar widget), D-413 (dashboard list-page pattern), D-003 (RBAC catalog).

---

## Problem

`/dashboard/site-visits` is a Phase-0 placeholder page — it exists only so the D-222 calendar widget's day-cell links resolve instead of 404ing. There is no list view, no detail view, no status workflow beyond the thin 4-state machine D-012 shipped, and no coordinator surface at all. The `site_visit_coordinator` role named in PRD-v6.0 §2 does not exist in the `base_role` enum.

D-602 builds the real module: a filterable list, a detail page, an extended status workflow, and an atomic "claim today's coordination" mechanism — all org-scoped and role-scoped.

### Architecture reconciliation (PRD shorthand vs. actual schema)

PRD-v6.0 §D-602 / §D-601 describe the data model as `ALTER TABLE site_visits …`. **There is no `site_visits` table.** Per `baseline/110-graph-data-model.md` §I, the CRM is single-table polymorphic: a site visit is a row in `nodes` with `node_type='site_visit'`, its fields in the `nodes.data` jsonb, validated by `src/lib/nodes/schemas/site_visit.ts`. `baseline/110` §I marks new `node_type` values and per-type tables as forbidden patterns. D-602 therefore:

- **extends the `site_visit` jsonb Zod schema** with the cab/driver/assignment fields (additive, no migration), rather than adding columns to a non-existent table;
- **adds exactly one genuinely-new table** — `site_visit_coordinator_claims` — which is a per-day coordination lock, not a polymorphic entity, so it is correctly its own table.

### Baseline 110 §III amendment — site_visit state list

`baseline/110-graph-data-model.md` §III ratifies the `site_visit` lifecycle as `scheduled → confirmed → completed → no_show` (4 states). PRD-v6.0 §D-602 mandates a 7-state workflow: `draft → scheduled → confirmed → in_progress → completed → cancelled → no_show`. D-602 **amends baseline 110 §III** for the `site_visit` row of the lifecycle table. Per baseline 110's own amendment process, this directive is the amendment vehicle; the impact assessment is in *Risks & decisions* below. The state list is app-enforced (`src/lib/nodes/states.ts` — baseline 110 §III: "DB does NOT enforce the (type, state) tuple"), so the amendment is a pure code change with **no migration** on `nodes`. The `baseline/110-graph-data-model.md` document edit itself is hook-blocked (`baseline/**` is write-protected) and is recorded as an **operator follow-up**.

D-602 ships:

1. **Role extension** — `base_role` enum gains the four V6 roles (`presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `site_visit_coordinator`) via `ALTER TYPE … ADD VALUE`. This is implementation-order §6's `role_extensions.sql`; D-602 lands it because it is the first Phase-1 directive that needs a new role, and D-610 (step 1.6, same phase) needs `presales_rep`. Bundling all four avoids three further enum migrations across Phase 1.
2. **7-state machine** — `src/lib/nodes/states.ts` + `src/lib/sitevisits/transitions.ts` extended to the PRD-v6.0 workflow; `cancelled` joins `no_show` as a reason-required terminal transition.
3. **jsonb schema extension** — `siteVisitSchema` gains optional `project_id`, `assigned_sales_rep_id`, `cab_provider`, `cab_booking_ref`, `driver_name`, `driver_phone`, `vehicle_number`, `pickup_address`, `pickup_time` (D-601 writes these in Phase 2; D-602's detail view renders whatever is present).
4. **`site_visit_coordinator_claims` table** — `PRIMARY KEY (organization_id, coordination_date)` makes "one coordinator per org per day" an atomic INSERT (PK conflict = already claimed). RLS org-scoped.
5. **List query** — `listSiteVisits()` with status / project / coordinator / sales-rep / date-bucket (today · upcoming · specific IST day) filters, org-scoped, role-scoped (sales reps see only their assigned visits; managers / coordinators / admins see all org visits).
6. **Pages** — `/dashboard/site-visits` (list + filter bar + coordinator-claim banner) replaces the placeholder; `/dashboard/site-visits/[id]` (detail: metadata, cab block, status-transition control, activity history).
7. **Server actions** — transition, claim/release coordination, assign sales rep — each `getCurrentUser` → `requirePermission` → discriminated-union return.
8. **Sidebar** — a "Site Visits" entry in `CommandCenterSidebar.PRIMARY_NAV`, gated on `site_visits:view`.
9. **RBAC** — new permissions `site_visits:coordinate`, `site_visits:assign`; the four new roles wired into `BASE_ROLE_PERMS`.

---

## Success criteria (production target 80/90)

- [ ] **AC-1** `/dashboard/site-visits` renders org-scoped, RLS-protected results. Server component: `getCurrentUser` → `resolveForUser` → `site_visits:view` gate → `listSiteVisits()`. The `?date=YYYY-MM-DD` param from the D-222 calendar widget filters to that IST day; `?bucket=today|upcoming`, `?status=`, `?project=`, `?sales_rep=`, `?coordinator=` filter further. The `nodes` SELECT is filtered by `organization_id` (load-bearing on the service-role read).

- [ ] **AC-2** Status transitions are audit-logged with provenance. `transitionSiteVisitAction` calls the existing `transitionSiteVisit()` (api.ts), which writes one `audit_log` row (`action='state_change'`, `diff: { from, to, reason? }`). The 7-state machine is enforced by `assertTransitionAllowed`; illegal transitions throw before any write. `cancelled` and `no_show` both require a non-empty reason.

- [ ] **AC-3** Coordinator claim is atomic — exactly one coordinator per `(organization_id, coordination_date)`. `claimCoordination()` is a bare INSERT into `site_visit_coordinator_claims`; the composite PK rejects the second claimant with a unique-violation, surfaced as `{ ok: false, reason: 'already_claimed', coordinator_id }`. `releaseCoordination()` deletes the caller's own claim.

- [ ] **AC-4** Role-scoped visibility. `org_admin` / `org_owner` / `workspace_admin` / `manager` / `site_visit_coordinator` see all org visits. `sales_rep` / `presales_rep` / `telemarketing_rep` / `customer_recovery_rep` see only visits where they are `assigned_sales_rep_id`, `coordinator_id`, or `created_by`. (Team-by-project narrowing for managers — PRD AC-4 "their team's projects" — depends on D-608 `project_sales_assignments` + teams wiring; D-602 has managers see all org visits and notes the narrowing as a D-608 follow-up.)

- [ ] **AC-5** Filtering by status + project + date is indexed. A partial expression index `nodes (organization_id, (data->>'scheduled_at')) WHERE node_type='site_visit' AND deleted_at IS NULL` plus the existing `nodes_org_ws_type_state_idx` keep the filtered query on the btree path; org-narrowed result sets (≤ low-thousands of visits/org) bucket in-memory well under the 500 ms p95 target.

- [ ] **AC-6** Detail page `/dashboard/site-visits/[id]` renders all visit metadata + cab block + activity history (audit_log rows for that `record_id`) + a status-transition control showing only `allowedTransitions(current)`. Cross-org / missing id → `notFound()`.

- [ ] **AC-7** RBAC: `site_visits:coordinate` (→ `site_visit_coordinator` + org_admin plane), `site_visits:assign` (→ manager + coordinator + org_admin plane) added to the literal `PERMISSIONS` catalog. The four new `base_role` values are present in `BASE_ROLES` (types.ts) and `BASE_ROLE_PERMS` (rbac.ts) so `effectivePermissions` never resolves an undefined set.

- [ ] **AC-8** Tests: extend `tests/lib/sitevisits/transitions.test.ts` + `api.test.ts` + `tests/lib/nodes/states.test.ts` for the 7-state machine; new `tests/lib/sitevisits/list.test.ts` + `coordinator.test.ts`; RTL tests for the filter bar + status control + claim banner; `tests/integration/site-visit-coordinator-claims.test.ts` proving atomic claim + cross-tenant RLS isolation. `npx tsc --noEmit` clean for changed files; targeted vitest suite green.

- [ ] **AC-9** All 10 V6 stopping-criteria gates pass (`CLAUDE.md` §STOPPING CRITERIA, `v4`→`v6`). Two migrations apply: `20260514130000_v6_role_extensions.sql`, `20260514130100_site_visit_v6.sql`.

---

## Non-goals (deferred)

- **Cab booking write path** — D-602 renders the cab/driver fields read-only on the detail page; the form that *populates* them is D-601 (Site Visit Booking Agent, Phase 2).
- **Site Visit Booking Agent / VIQ → draft visit** — D-601, Phase 2. D-602 only consumes `state='draft'` rows; it does not create them from VIQ events.
- **Team-by-project manager scoping** — needs D-608 `project_sales_assignments`. D-602: managers see all org visits.
- **GPS check-in / map view / customer cab-tracking link** — out of V6 scope per PRD-v6.0 §D-602.
- **The other three new roles' full operational surfaces** — D-602 wires `presales_rep` / `telemarketing_rep` / `customer_recovery_rep` into `BASE_ROLE_PERMS` with a sensible operational permission set so the enum value is usable, but their dedicated dashboards/queues are D-605 / D-610 / D-616. D-602 does **not** add them to `GRANTABLE_APP_ROLES` (bridge-role grants are D-003-ext territory).
- **`baseline/110` document edit** — hook-blocked; operator follow-up.

---

## Stack

- **New:** `supabase/migrations/20260514130000_v6_role_extensions.sql`, `supabase/migrations/20260514130100_site_visit_v6.sql`, `src/lib/sitevisits/list.ts`, `src/lib/sitevisits/detail.ts`, `src/lib/sitevisits/coordinator.ts`, `src/app/(dashboard)/dashboard/site-visits/[id]/page.tsx`, `src/app/(dashboard)/dashboard/site-visits/actions.ts`, `src/components/sitevisits/site-visit-filter-bar.tsx`, `src/components/sitevisits/site-visit-status-control.tsx`, `src/components/sitevisits/coordinator-claim-banner.tsx`, `src/components/sitevisits/site-visit-list-table.tsx`, plus tests.
- **Modified:** `src/lib/nodes/states.ts` (7-state list), `src/lib/sitevisits/transitions.ts` (7-state machine), `src/lib/sitevisits/api.ts` (`cancelled` reason guard), `src/lib/nodes/schemas/site_visit.ts` (jsonb fields), `src/lib/sitevisits/calendar-types.ts` + `calendar.ts` + `src/components/cockpit/site-visit-calendar.tsx` (7-state buckets/tints — D-222 impact), `src/lib/auth/types.ts` (`BASE_ROLES`), `src/lib/auth/rbac.ts` (perms + roles), `src/components/shell/command-center-sidebar.tsx` (nav entry), `src/app/(dashboard)/dashboard/site-visits/page.tsx` (placeholder → real).
- **Reuses:** `src/lib/nodes/api.ts` (`updateNodeData`), `src/lib/sitevisits/api.ts` (`createSiteVisit`, `transitionSiteVisit`), `getCurrentUser` / `resolveForUser` / `requirePermission`, `getSupabaseAdmin`, the `@/components/ui/*` table/badge/card/button/select primitives.
- **DB:** `ALTER TYPE base_role`; one new table `site_visit_coordinator_claims`; one new partial index on `nodes`. No destructive change.
- TDD enforced. Branch deploys only.

---

## Authority

- **Implementation-order §4 step 1.5** — D-602 is Phase 1's site-visit module; fixes the placeholder and becomes the surface D-601 writes to.
- **PRD-v6.0 §D-602** — the 7-state workflow, coordinator claim, list/detail scope are specified there verbatim.
- **baseline/110 §I + §III** — D-602 honors §I (no new per-entity table for site visits; extend the jsonb schema) and *amends* §III (the `site_visit` state list). This directive is the baseline-110 amendment vehicle; see *Risks & decisions*.
- **Constitution II** — tenant isolation: every `listSiteVisits` / `getSiteVisitDetail` / coordinator query filters by `organization_id`; the integration test is the regulator's proof.
- **Constitution III** — provenance: `transitionSiteVisit` already writes an audit row per transition; coordinator claims carry `claimed_at`.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migrations** (from repo root, `DATABASE_URL` set): `node scripts/apply_migration.mjs supabase/migrations/20260514130000_v6_role_extensions.sql` then `node scripts/apply_migration.mjs supabase/migrations/20260514130100_site_visit_v6.sql`. Then `node scripts/verify_602.mjs`.
- [ ] **Baseline 110 §III edit (hook-blocked — operator-owned).** Update the `site_visit` row of the lifecycle-states table in `baseline/110-graph-data-model.md` §III to `draft, scheduled, confirmed, in_progress, completed, cancelled, no_show` (terminals: `completed, cancelled, no_show`). The code + this directive are the amendment; the baseline doc is write-protected from the agent. Rationale belongs in `memory/decisions.md`.
- [ ] **Smoke** `/dashboard/site-visits` as a `site_visit_coordinator`: list renders, claim-today button works, a second user's claim attempt is rejected.
- [ ] **Smoke** the detail page: transition a visit `scheduled → confirmed`, confirm the activity-history row appears.

---

## Risks & decisions

- **Baseline 110 §III impact assessment.** Extending `ALLOWED_STATES.site_visit` from 4 → 7 states affects: (a) `src/lib/sitevisits/transitions.ts` — rewritten for the 7-state graph; (b) `src/lib/sitevisits/calendar.ts` + `calendar-types.ts` + the D-222 cockpit widget — `STATES` / `emptyBuckets` / `dominantState` / `STATE_TINT` extended to cover `draft` / `in_progress` / `cancelled` (existing 4-state rows still bucket correctly — the old states are a strict subset); (c) `validateState` (states.ts) now admits the three new values — existing site-visit rows are unaffected because the change is purely additive. No shipped directive *rejects* the new states; the 4-state callers (D-012 reminder agent, `findUpcomingSiteVisits`) only ever query `state='scheduled'` and are untouched. The DB stores `state` as free `text` (baseline 110 §III) so there is no constraint migration.
- **`ALTER TYPE … ADD VALUE` inside a transaction.** `apply_migration.mjs` wraps each file in `BEGIN/COMMIT`. PostgreSQL 12+ (Supabase is 15) permits `ALTER TYPE … ADD VALUE` inside a transaction block provided the new value is not *used* in the same transaction. `20260514130000_v6_role_extensions.sql` only adds the four values — it inserts no rows and creates nothing that references them — so it is transaction-safe. `IF NOT EXISTS` makes it idempotent (the ledger in `apply_migration.mjs` also guards re-application).
- **Coordinator claim is a lock, not an entity.** `site_visit_coordinator_claims` deliberately has no soft-delete / provenance triple — it is a per-day mutex. Releasing a claim is a hard `DELETE` of the caller's own row. This is the one place D-602 hard-deletes, and it is correct: a released claim carries no audit value beyond the `audit_log` row the action writes.
- **Role-scoping uses `data->>` filters.** `sales_rep` visibility filters on `data->>'assigned_sales_rep_id'`, `data->>'coordinator_id'`, and the top-level `created_by` column via a PostgREST `.or()`. The partial expression index covers the date path; the `created_by` / jsonb predicates are evaluated against the already-org-narrowed row set, which is small. If a pilot org's site-visit volume ever makes this slow, a `data->>'assigned_sales_rep_id'` expression index is the follow-up — not needed at V6 pilot scale.
- **`presales_rep` et al. get a SALES_REP-equivalent operational set.** D-602 must put *something* in `BASE_ROLE_PERMS` for the new roles or `effectivePermissions` resolves `new Set(undefined)`. The chosen sets are deliberately close to `sales_rep` (the new rep roles) and a focused read+coordinate set (`site_visit_coordinator`). D-605 / D-610 / D-616 refine these when their surfaces land.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — `listSiteVisits` / `getSiteVisitDetail` / coordinator reads all run through `getSupabaseAdmin()` (service-role, RLS-bypassing) and therefore MUST filter by `organization_id` in the query body. The integration test provisions two orgs and proves org A's caller never sees org B's visits or claims.
- **`server-action-result-discriminated-union`** — every D-602 server action returns `{ ok: true, … } | { ok: false, reason, … }`; no throwing across the action boundary.
- **`injectable-supabase-client-for-tests`** — `listSiteVisits` / `getSiteVisitDetail` / `claimCoordination` take an optional `client` last-arg (default `getSupabaseAdmin()`), matching `src/lib/sitevisits/api.ts`, so unit tests inject the chainable mock and the integration test injects a real client.
- **`additive-only-migrations`** — both migrations are `IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`; each carries an explicit `ROLLBACK:` comment block; neither drops or destructively alters anything.
