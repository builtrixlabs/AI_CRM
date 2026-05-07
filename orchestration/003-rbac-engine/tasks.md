# Tasks — 003-rbac-engine

Ordered for TDD execution. Estimated working sessions: **2-3**.

---

## Group A — Permission catalog + matrix tests

### A1. [unit] Expand `Permission` to literal union + freeze the catalog

- Update `tests/lib/auth/permission-catalog.test.ts` (new):
  - `PERMISSIONS` array length matches spec catalog count.
  - `PLATFORM_ONLY_PERMISSIONS` ⊂ PERMISSIONS.
  - Every PERMISSION appears in at least one of `BASE_ROLE_PERMS` ∪ `APP_ROLE_PERMS` (no orphans).
- Update `src/lib/auth/rbac.ts`:
  - Define `PERMISSIONS` literal array, derive `Permission` from `(typeof PERMISSIONS)[number]`.
  - Replace minimal `BASE_ROLE_PERMS` and `APP_ROLE_PERMS` with full sets per PRD §9.4 + spec.
  - Expand `PLATFORM_ONLY_PERMISSIONS` to the 10 platform perms.
  - Body of `effectivePermissions` is unchanged.

### A2. [unit] Sampled role × permission matrix

- Add 25 cells from spec.md to `tests/lib/auth/rbac.test.ts`. RED first (some cells fail because base maps were minimal in D-001).
- After A1 the matrix tests pass. Re-run all D-001 + D-002 unit suites — must remain green.

### A3. [unit] PLATFORM_ONLY-filter regression

- Confirm existing test "allow-override on PLATFORM_ONLY filtered" still passes for every perm in the expanded `PLATFORM_ONLY_PERMISSIONS`, not just `platform:manage`.

### Commit checkpoint A

- [ ] All unit tests green (D-001 + D-002 + new matrix + catalog).
- [ ] Coverage on `src/lib/auth/rbac.ts` ≥ 90%.
- [ ] Commit: `feat(rbac): expand permission catalog (~120 perms × 9 roles) (D-003 group A)`

---

## Group B — `role_permission_overrides` table

### B1. [migration] Table

- `supabase/migrations/20260507140000_role_permission_overrides.sql` per spec.

### B2. [migration] Guard trigger

- `20260507140100_role_permission_overrides_guard.sql` — BEFORE INSERT/UPDATE raises 42501 if `mode='allow' AND permission ∈ PLATFORM_ONLY_LIST`.

### B3. [migration] RLS

- `20260507140200_role_permission_overrides_rls.sql` — org-scoped policies + NOTIFY pgrst.

### B4. [integration] End-to-end override behaviour

- `tests/integration/role-permission-overrides.test.ts`:
  - Insert an allow row for `(org, sales_rep, leads:bulk_import)` → resolver reflects it for that role-bridge user; bridge user gets `leads:bulk_import` in their effective set.
  - Insert a deny row for `(org, sales_rep, leads:view)` → effective set loses `leads:view`.
  - Insert allow `(org, org_admin, platform:manage)` → DB rejects with SQLSTATE 42501.
  - Cross-tenant: rep B in another org cannot SELECT rep A's overrides.
  - super_admin SELECT returns 0 rows.

### Commit checkpoint B

- [ ] Migrations applied; remote + local in sync via `supabase migration list`.
- [ ] All integration tests green (D-001 + D-002 + new B4).
- [ ] Commit: `feat(db): role_permission_overrides + guard + RLS (D-003 group B)`

---

## Group C — Server-action helpers + override CRUD

### C1. [unit] `hasPermission` / `requirePermission` / `requireAnyOf`

- Tests:
  - has: returns true / false correctly; uses cached set when provided.
  - require: throws `PermissionDenied` with `{ user_id, perm, org_id }`.
  - requireAnyOf: returns first matched; throws if none.
- Implement `src/lib/auth/permissions.ts`.

### C2. [unit] `PermissionDenied` error shape

- Test the error class: `instanceof Error`, `name === 'PermissionDenied'`, exposes the three fields, message format includes the perm name.

### C3. [unit] `overrides.ts` library

- `tests/lib/auth/overrides.test.ts` (mocked supabase): upsertOverride writes one node-style audit row with `action='rbac_override_upsert'`; softDeleteOverride is idempotent and writes `action='rbac_override_delete'`.
- Implement `src/lib/auth/overrides.ts` using the service-role client.

### Commit checkpoint C

- [ ] `npm run build` green.
- [ ] All unit + integration tests green.
- [ ] Commit: `feat(auth): permission check helpers + override library (D-003 group C)`

---

## Group D — Verify + PR

### D1. [doc] Update memory

- Append to `memory/decisions.md`:
  - D-003.1 `Permission` is a literal union; rbac.ts is single source.
  - D-003.2 PLATFORM_ONLY duplicated in DB trigger; drift detector deferred to D-014.
  - D-003.3 `requirePermission` throws; helpers accept cached set for hot paths.
- Append patterns: `permission-catalog-as-literal-union`, `belt-and-suspenders-platform-only`, `cached-resolver-set-per-request`.

### D2. [verify] V5 Gate 4

- `npm run test` → ≥ 100 unit tests pass.
- `npm run test:integration` → ≥ 25 integration tests pass.
- `npm run test:coverage` → ≥ 80 / ≥ 90 on `src/lib/auth/`.
- `npm run build` → ✓.

### D3. [deploy] Vercel preview

- Push branch; Vercel auto-builds. Existing env vars cover D-003.

### D4. [merge] PR

- `gh pr create --base v1 --head feature/003-rbac-engine`.

---

## Commit cadence

| Checkpoint | Commit message |
|---|---|
| A | `feat(rbac): expand permission catalog (~120 perms × 9 roles) (D-003 group A)` |
| B | `feat(db): role_permission_overrides + guard + RLS (D-003 group B)` |
| C | `feat(auth): permission check helpers + override library (D-003 group C)` |
| D | `doc: D-003 decisions + patterns; verify (D-003 group D)` |

Final PR title: `feat: D-003 RBAC engine`

---

## Reviewer questions for Plan Mode

1. **Catalog coverage.** Spec lists ~70 permissions. PRD says "~120". The remaining ~50 are reserved for D-004 (super_admin) and D-005 (org_admin cockpit) which add their own perms when shipping. OK to land the **stable core** here, or pre-list every perm now?
2. **PLATFORM_ONLY duplicated in DB trigger.** Belt-and-suspenders defense. Drift-detection CI deferred to D-014. Acceptable?
3. **Resolver caching.** Helpers accept an optional pre-resolved `Set<Permission>` so server actions resolve once. No global cache. Acceptable, or want a request-level cache via Next.js `cache()` instead?
4. **`requirePermission` throws** vs. returning a Result. Throw is simpler and integrates with Next.js error boundaries. OK?
5. **Override `reason` is NOT NULL.** Per Constitution III provenance + auditability. Acceptable, or want it nullable for trivial cases?
6. **No baseline ratification.** PRD §9.3 explicitly says rbac.ts is the source of truth (Constitution VIII). No new baseline doc. Acceptable?
