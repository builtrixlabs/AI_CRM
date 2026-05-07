# Tasks — 001-multi-tenancy-foundation

Ordered for TDD execution. `scripts/v5/tdd-task.sh` consumes one at a time; each task = RED test → minimal impl → REFACTOR while green.

Estimated working sessions: **3-5**. Group boundaries are natural commit points.

---

## Group A — Pure unit shells (no DB)

### A1. [unit] RBAC resolver — base layer

- Write `tests/lib/auth/rbac.test.ts` covering: empty inputs → empty set; `super_admin` base → contains `'platform:manage'`; `sales_rep` base → contains `'leads:view'` and not `'platform:manage'`.
- Stub `src/lib/auth/rbac.ts`: `effectivePermissions({ base_role, ... })` with a 7-row base map (one row per non-system role) and `PLATFORM_ONLY_PERMISSIONS = new Set(['platform:manage'])`.
- Pass test.

### A2. [unit] RBAC resolver — bridge UNION

- Test: bridge `app_roles=['workspace_admin']` adds workspace-admin permissions to a `sales_rep` base.
- Implement bridge UNION.

### A3. [unit] RBAC resolver — allow / deny / deny-wins

- Tests:
  - allow override grants previously-denied perm.
  - deny override removes a perm even if base+bridge had it.
  - deny over allow on same perm → not granted.
- Implement allow/deny logic.

### A4. [unit] RBAC resolver — PLATFORM_ONLY guard

- Test: granting `'platform:manage'` to `org_admin` via allow override is rejected (resolver throws or filters silently — pick one and document).
- Decision: **filter silently** (don't surface override-validation in resolver; D-003 admin UI rejects at write time).
- Test asserts the perm is NOT in resulting set.

### A5. [unit] route-policy.ts — pure decisions

- Write `tests/lib/auth/route-policy.test.ts` covering all 8 (role × surface) cases from spec AC-1..AC-8.
- Implement `decideRoute(user, pathname)` as a pure function returning `{ kind: 'allow' | 'redirect' | '401', target?: string }`.

### Commit checkpoint A

- [ ] All Group A tests green.
- [ ] Coverage of `src/lib/auth/rbac.ts` + `src/lib/auth/route-policy.ts` ≥ 90% lines.
- [ ] Commit: `feat(auth): RBAC resolver + route policy (D-001 group A)`

---

## Group B — Migrations + integration tests

### B1. [migration] 001_orgs_and_workspaces

- Write `supabase/migrations/<ts>_orgs_and_workspaces.sql` per spec.
- Include `CREATE FUNCTION auth.org_id() RETURNS uuid` reading from JWT claim.
- Run `supabase migration up --linked --dry-run` to syntax-check.

### B2. [migration] 002_users_and_auth

- Migration: `base_role` enum, `profiles` table with constraint, `on_auth_user_created` trigger that creates profile row.

### B3. [migration] 003_user_app_roles_bridge

- Migration: `user_app_roles` table.

### B4. [migration] 004_audit_log

- Migration: table + INSERT-only RLS policy for `service_role`.
- **Important**: no UPDATE/DELETE policy = forbidden by default.

### B5. [migration] 005_rls_policies

- Enable RLS on every domain table. Add SELECT/INSERT/UPDATE policies scoped by `auth.org_id()`.
- Add SELECT policy on `audit_log`: same-org rows + platform-wide system rows for super_admin.

### B6. [integration] audit_log immutability

- Test `tests/integration/audit-log-immutable.test.ts`:
  - Sign in as `service_role`. Insert one row → ok.
  - UPDATE that row → expect Postgres error (no UPDATE policy).
  - DELETE that row → expect Postgres error.
- Apply migrations 001-004 to preview branch. Test passes.

### B7. [integration] org-isolation

- `tests/integration/rls-org-isolation.test.ts`:
  - Seed: 2 orgs, each with 1 sales_rep profile.
  - Sign in as Org A's sales_rep. SELECT * FROM profiles → exactly 1 row, Org A.
  - Sign in as Org B's sales_rep. SELECT * FROM profiles → exactly 1 row, Org B.

### B8. [integration] super-admin-zero

- `tests/integration/rls-super-admin-zero.test.ts`:
  - Seed: 1 org + 1 sales_rep profile.
  - Sign in as super_admin (no `organization_id` claim).
  - SELECT * FROM profiles, workspaces, teams → all return 0 rows.
  - Insert one `audit_log` row with `action='platform_org_created'`. super_admin SELECT audit_log → 1 row visible.

### B9. [integration] channel_partner placeholder

- Create test fixture table `cp_submissions(id, workspace_id, organization_id, submitted_by_user_id, ...)` — **NOT** in production migrations; only in `tests/fixtures/cp-test-table.sql`.
- Test: CP A inserts 2 rows, CP B inserts 1. CP A SELECT → only its 2. CP B SELECT → only its 1.
- This proves the RLS pattern that D-002 will replicate on `leads`.

### Commit checkpoint B

- [ ] All Group B tests green against preview branch.
- [ ] Migrations applied cleanly with `supabase migration up --linked` and `--dry-run` produces zero diff.
- [ ] Commit: `feat(db): multi-tenancy schema + RLS (D-001 group B)`

---

## Group C — App routes + middleware

### C1. [unit] supabase clients + getCurrentUser

- Create `src/lib/supabase/{server,admin}.ts`.
- Tests `tests/lib/auth/getCurrentUser.test.ts` with mocked Supabase client:
  - Returns `null` when no session.
  - Returns full `CurrentUser` shape when session + profile exist.
  - Loads `app_roles` from `user_app_roles` joined on workspaces.
- Implement `getCurrentUser`.

### C2. [unit] middleware

- Wire `src/middleware.ts` to call `getCurrentUser` then `decideRoute`.
- Unit test: stub the user, call middleware with a NextRequest, assert response.

### C3. [route] minimal app pages

- Create `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`.
- Add `src/app/{auth/sign-in,auth/callback,403}` routes.
- Add `src/app/(platform)/platform/page.tsx`, `(admin)/admin/page.tsx`, `(dashboard)/dashboard/page.tsx`, all placeholder content.
- Add `src/app/api/auth/whoami/route.ts`.
- Run `npm run build` — must compile.

### C4. [e2e@smoke] auth-redirects

- `tests/e2e/auth-redirects.spec.ts`:
  - Provision 1 org + 4 users (super_admin, org_admin, sales_rep, channel_partner) via supabase admin API in `beforeAll`.
  - Sign in as each → assert landing route.
  - Hit each protected surface → assert 302 target.

### C5. [e2e@regression] cross-tenant-leak

- `tests/e2e/cross-tenant-leak.spec.ts`:
  - Provision 2 orgs each with 1 sales_rep.
  - Sign in as Org A. GET `/api/auth/whoami` → only Org A data.
  - Attempt to read Org B's profile by ID via direct API → 0 rows / 403.

### Commit checkpoint C

- [ ] `npm run build` succeeds.
- [ ] All Group C tests green.
- [ ] Commit: `feat(app): auth middleware + placeholder routes + e2e (D-001 group C)`

---

## Group D — Bootstrap script + final checks

### D1. [script] bootstrap-super-admin.sh

- Write `scripts/bootstrap-super-admin.sh`.
- Integration test `tests/integration/bootstrap.test.ts` that runs the script against a clean preview branch and asserts:
  - 1 row in profiles with `base_role='super_admin'`.
  - 1 row in audit_log with `action='bootstrap_super_admin'`.
- Re-run → 0 new profiles, 1 new audit row with `action='bootstrap_super_admin_replay'`.

### D2. [refactor] doc decisions

- Append to `memory/decisions.md`:
  - Provenance fields enforced via column-level NOT NULL + app-set defaults (not Postgres trigger).
  - Audit log writes from app code (server actions), not Postgres triggers.
  - PLATFORM_ONLY override silently filtered at resolve time, hard-rejected at write time in D-003.
- Append to `memory/learned/ai-crm/patterns.md` (create file): pattern `RLS+JWT-claim` with confidence 1.

### D3. [verify] V5 Gate 4 — full suite

- Run `npm run test` (all unit + integration).
- Run `npm run test:playwright` (smoke + regression).
- Run `npm run test:coverage` — confirm thresholds met.
- Run `bash scripts/v5/verify.sh` if present.
- Run secret scanner (`npm run test:security`).
- Run V5's PreToolUse / PostToolUse hooks (already wired) — review `memory/logs/execution/` for any blocked operations.

### D4. [deploy] V5 Gate 5 — preview URL

- Push branch `feature/001-multi-tenancy-foundation`.
- Vercel build runs (requires Vercel project linked first — currently outstanding).
- Get preview URL.
- Manually walk: sign-in as super_admin → /platform; sign-in as sales_rep (after seeding) → /dashboard; attempt /platform as sales_rep → 302.

### D5. [merge] open PR, await Plan Mode reviewer

- Open PR from `feature/001-multi-tenancy-foundation` → `main` (or `v1`?  decide before merge — see Plan Mode discussion).
- Watchdog (Gate 6) arms post-merge.

---

## Commit cadence summary

| Checkpoint | Commit message |
|---|---|
| A | `feat(auth): RBAC resolver + route policy (D-001 group A)` |
| B | `feat(db): multi-tenancy schema + RLS (D-001 group B)` |
| C | `feat(app): auth middleware + placeholder routes + e2e (D-001 group C)` |
| D | `feat(ops): super_admin bootstrap script + decisions log (D-001 group D)` |

Final PR title: `feat: D-001 multi-tenancy foundation`

---

## Reviewer questions for Plan Mode

1. **Branch strategy** — work on `feature/001-...` off `main`, or off `v1`? `v1` is currently 1 commit ahead of `main` (the doc imports). My recommendation: branch off `v1`, PR back into `v1`, merge `v1` → `main` only when V0 is shipped.
2. **Test DB strategy** — Supabase preview branch (slow, real RLS) vs. local supabase via docker (fast, real RLS) vs. mocked tests only. Recommendation: integration tests against **local supabase** for dev speed; CI runs against **preview branch** to validate against real config.
3. **Provenance enforcement** — column NOT NULL with app-set defaults (this plan) vs. Postgres trigger that auto-fills. Recommendation: app-set for D-001; revisit if drift surfaces.
4. **`organization_id` JWT claim** — Supabase Auth Hook (PG function) vs. server-side custom token wrapper. Recommendation: **Auth Hook**, declared in 002 migration.
5. **Channel partner table** — placeholder `cp_submissions` (this plan) vs. defer the CP isolation test until D-002 ships `leads`. Recommendation: ship the placeholder; gives us an isolation contract to keep D-002 honest.
6. **Vercel project + `claude` CLI** — outstanding blockers (per `docs/install-plan.md`). Plan Mode should decide whether D-001 implementation can run in this environment without them.
