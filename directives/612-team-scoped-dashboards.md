# Directive 612 — Team-Scoped Dashboards

**Kind:** feature (V6 Phase 3, step 3.2 — managers publish dashboards to specific teams)
**Status:** AUTHORIZED — operator cleared Phase 3 to run end-to-end 2026-05-19 ("D-616 → D-606 → D-612 → D-611, autonomous").
**Branch target:** `v6.3`.
**Generated:** 2026-05-19T14:30:00Z
**Source:** `docs/PRD-v6.0.md` §D-612 (lines 785-825); `docs/plans/v6-implementation-order.md` §4 step 3.2.
**Builds on:** D-021 (existing dashboard engine + `dashboard_definitions` table), D-001 (`teams` table), D-610 (`team_members` membership table).

---

## Problem

Today every dashboard authored at `/admin/dashboards` is implicitly org-wide — there is no way for a presales manager to say "this 'Today's hot leads + my team's followups' dashboard is for the presales team only". D-612 wires that: a publish-to-team action on each dashboard, a `team_dashboard_assignments` link table, and a team-scoped lens on the dashboards list so a presales rep sees the team-published dashboards above (or instead of) the rest.

D-612 ships:

1. **Migration** `20260519140000_team_dashboard_assignments.sql` — one new table, `(dashboard_id, team_id)` unique, with `is_default` + `published_by` provenance. RLS enforces org isolation; the `dashboards:publish_to_team` permission is gated in server actions.
2. **Team-scoping lib** `src/lib/dashboards/team-scoping.ts` — `publishDashboardToTeam`, `revokeDashboardFromTeam`, `listAssignmentsForDashboard`, `getTeamDashboardsForViewer(user)`.
3. **RBAC** — new `dashboards:publish_to_team` permission held by `manager` + `org_admin` (cascades to `workspace_admin` + `org_owner`).
4. **UI** — `/admin/dashboards/[id]/teams` page lists the dashboard's current team assignments + publish form + revoke buttons. The existing `/admin/dashboards` card gets a "Manage team publication" link for users who hold the new perm.

The "team-scoped view for viewers" surface (a section of `/dashboard` showing the dashboards published to the viewer's teams) is a small follow-up wired in this same directive but in a deliberately minimal way: `getTeamDashboardsForViewer()` is the seam — the V6 Command Center already renders role-aware widget sets (D-605), so D-612 ships the *data* via the new helper and leaves richer surfacing for a polish PR.

---

## Architecture decisions

- **Single `team_dashboard_assignments` link table.** One row per (dashboard, team). `UNIQUE (dashboard_id, team_id)` makes "publish twice" a benign idempotent no-op (the action catches 23505 and treats it as success). `is_default boolean DEFAULT false` per PRD AC-1 ("team members see it as their default dashboard"); D-612 stores it but the V6 list surface treats every team-published dashboard equally (the "default" lever is V6.x polish).
- **No new RLS shape — same posture as D-602 / D-610.** The link table's RLS gates `organization_id = app_org_id()` only; the `dashboards:publish_to_team` permission is gated in server actions. Manager (a holder of the perm) is not org-admin-tier, so we keep the same RLS pattern that worked for D-602's site-visit-coordinator-claims and D-610's allocation rules.
- **Author rights stay where they were (org_admin / workspace_admin).** PRD says "manager builds a dashboard and publishes" — V6 ships only the *publish* delegation to manager; authoring stays gated on the existing `dashboards:customize` perm (org_admin tier). Reason: extending `dashboards:customize` to manager would touch the `dashboard_definitions` RLS that already cites `app_is_org_admin_or_super()`, a heavier schema change that the V6 pilot doesn't need. Documented as a V6.x follow-up.
- **`getTeamDashboardsForViewer` joins `team_members → team_dashboard_assignments → dashboard_definitions` in JS.** No PostgREST embedded join: three separate queries, batch the dashboard fetch by id set. Same pattern as D-602's site-visit list and D-616's recovery queue.
- **Revoke is a hard DELETE.** The link table is a membership link, not a domain entity — no soft-delete / provenance triple. Removing a publication is a hard delete + an audit row in `audit_log`. Same posture as D-610's `team_members`.

---

## Success criteria

- [ ] **AC-1** A `manager` (or `org_admin`) opens `/admin/dashboards/[id]/teams`, picks a team from a dropdown, clicks Publish — a `team_dashboard_assignments` row appears with the chosen team + the actor as `published_by`. Audit row: `action='dashboard_published_to_team'`.
- [ ] **AC-2** Clicking Revoke deletes the assignment. Audit row: `action='dashboard_revoked_from_team'`.
- [ ] **AC-3** A second publish of the same (dashboard, team) is a benign idempotent no-op (23505 caught + reported as `{ ok: true, idempotent: true }`).
- [ ] **AC-4** Cross-tenant: a publish from org A cannot target a team from org B — both the action input is validated (dashboard.org === team.org === caller.org) and the RLS would refuse the cross-org insert.
- [ ] **AC-5** `getTeamDashboardsForViewer({user_id, organization_id})` returns the set of dashboards whose `team_id` is in the user's `team_members` list. A user in no teams gets `[]`; a sales rep in the presales team sees the presales-published dashboard; a sales rep NOT in presales does not.
- [ ] **AC-6** RBAC: `dashboards:publish_to_team` is in the literal `PERMISSIONS` catalog and held by `manager` + `org_admin` (cascades). A non-holder who lands on `/admin/dashboards/[id]/teams` gets `redirect("/403")`.
- [ ] **AC-7** Tests: `team-scoping.test.ts` (publish/revoke/viewer lookup + idempotency + cross-tenant), `team-scoping.test.tsx` (RTL on the manage page), `dashboards-team-cross-tenant.test.ts` (integration). `npx tsc --noEmit` clean; targeted vitest green.
- [ ] **AC-8** All 10 V6 stopping-criteria gates pass. Migration `20260519140000_team_dashboard_assignments.sql` applies; `scripts/verify_612.mjs` PASS against live Supabase.

---

## Non-goals (deferred)

- **Letting `manager` author dashboards.** The PRD says "manager builds + publishes"; D-612 ships *publish* delegation and leaves *author* on org_admin. Extending requires touching `dashboard_definitions` RLS. Documented V6.x follow-up.
- **Per-user dashboard layouts** — team scoping is the V6 increment; per-user defaults stay as the existing app-wide ones.
- **A "default dashboard" lever surfacing one team dashboard above the others on login.** `is_default` is stored; surfacing it is V6.x polish.
- **Conditional widgets based on user role** — use widget-level perms (existing).
- **A team-publication audit page beyond the per-dashboard /teams view.**

---

## Stack

- **New:** `supabase/migrations/20260519140000_team_dashboard_assignments.sql`, `src/lib/dashboards/team-scoping.ts`, `src/app/(admin)/admin/dashboards/[id]/teams/{page,actions,publish-form,revoke-button}.tsx`, `scripts/verify_612.mjs`, plus tests.
- **Modified:** `src/lib/auth/rbac.ts` (new perm + role assignments), `src/app/(admin)/admin/dashboards/page.tsx` ("Manage publication" link per card, gated on the new perm).
- **Reuses:** `getSupabaseAdmin`, the existing `dashboard_definitions` table, the `teams` table from D-001, `team_members` from D-610, the org-RLS-app-permission migration pattern.
- **DB:** one new table. No destructive change.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-612** — the schema (`team_dashboard_assignments`), the publish/revoke verbs, the cross-tenant gate.
- **Implementation-order §4 step 3.2** — "Manager assigns dashboard to presales / telemarketing / recovery / sales team."
- **Constitution II + III** — every link query filters by `organization_id`; every publish/revoke writes an `audit_log` row.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration**: `node --env-file=<parent>/.env scripts/apply_migration.mjs supabase/migrations/20260519140000_team_dashboard_assignments.sql`, then `node --env-file=<parent>/.env scripts/verify_612.mjs`.
- [ ] **Smoke**: as a manager (created via `/admin/users`), open `/admin/dashboards/[id]/teams`; publish the dashboard to a known team; confirm a member of that team can fetch `getTeamDashboardsForViewer` and see the dashboard.

---

## Risks & decisions

- **Idempotent publish on 23505.** Concurrent clicks on Publish from two browsers: the partial-unique `(dashboard_id, team_id)` index turns the second insert into a 23505; the lib returns `{ ok: true, idempotent: true }`. The audit row is only written on the first (the successful insert).
- **`team_dashboard_assignments` has no soft-delete.** A publication is a link; removing it is a hard DELETE + an audit row. Re-publishing creates a new row with a fresh `published_at`.
- **The "default" lever is stored but not surfaced.** `is_default boolean` ships in the table; the V6 list surfaces every team-published dashboard equally. Surfacing "this is my team's default" on the dashboards page is a polish PR — out of scope to keep D-612 tight.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — every lib query filters by `organization_id`; integration test proves cross-org isolation.
- **`rls-org-isolation-app-permission-gate`** — RLS enforces org isolation; `dashboards:publish_to_team` is gated in actions.
- **`server-action-result-discriminated-union`** — actions return `{ ok: true } | { ok: false, reason }`.
- **`additive-only-migrations`** — one `IF NOT EXISTS` table; explicit `ROLLBACK:` block.
