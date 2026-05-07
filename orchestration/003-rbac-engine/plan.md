# Plan — 003-rbac-engine

## Files to be created

### Application code

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/auth/permissions.ts` | 80 | `hasPermission`, `requirePermission`, `requireAnyOf`, `PermissionDenied` error class |
| `src/lib/auth/overrides.ts` | 130 | `listOverrides`, `upsertOverride`, `softDeleteOverride` — service-role helpers; each writes audit_log |
| `tests/lib/auth/permissions.test.ts` | 130 | unit tests for the three helpers, including PermissionDenied shape and cached-set fast path |
| `tests/lib/auth/overrides.test.ts` | 100 | mocked-supabase unit tests for upsert (validates org_id, mode, reason), softDelete idempotency |
| `tests/integration/role-permission-overrides.test.ts` | 130 | real-DB: insert allow override, verify resolver reflects it; insert PLATFORM_ONLY allow → guard rejects with 42501; org-isolation; audit_log row written |
| `tests/lib/auth/permission-catalog.test.ts` | 80 | catalog completeness — every Permission literal is referenced from at least one BASE_ROLE_PERMS or APP_ROLE_PERMS set; PLATFORM_ONLY_PERMISSIONS is a subset of PERMISSIONS |

### Migrations

| File | Lines (~) | Purpose |
|---|---|---|
| `supabase/migrations/20260507140000_role_permission_overrides.sql` | 60 | table + UNIQUE partial index |
| `supabase/migrations/20260507140100_role_permission_overrides_guard.sql` | 40 | BEFORE INSERT/UPDATE trigger that raises 42501 for PLATFORM_ONLY allow |
| `supabase/migrations/20260507140200_role_permission_overrides_rls.sql` | 40 | RLS scoped by `public.app_org_id()` + NOTIFY |

## Files to be modified

| File | Change |
|---|---|
| `src/lib/auth/rbac.ts` | Replace minimal D-001 maps with the full ~120-permission catalog. Tighten `Permission` from `string` to a literal union. Expand PLATFORM_ONLY_PERMISSIONS to all 10 platform-tier perms. Existing `effectivePermissions` body unchanged (the resolver was already correct). |
| `src/lib/auth/types.ts` | (no change — `BaseRole`, `AppRole` still authoritative; new `Permission` lives in rbac.ts to keep the catalog and types co-located) |
| `tests/lib/auth/rbac.test.ts` | Add the 25-cell sampled matrix from spec; existing 12 tests still pass with the expanded catalog. |

## Migrations applied via

```
supabase db push   # applies 20260507140000..20260507140200
```

Existing migrations and integration test fixtures are unaffected — `role_permission_overrides` is a fresh table.

## Tests (TDD order — RED → GREEN → REFACTOR per task)

Group order in [tasks.md](tasks.md):

1. **Group A — catalog + matrix tests** — expand types and Permission union, base maps, override semantics; verify D-001 matrix tests still pass + 25 new sampled cells.
2. **Group B — migrations + integration test** — table, guard trigger, RLS, real-DB test that an allow override flips the resolver and a PLATFORM_ONLY allow is rejected.
3. **Group C — server-action helpers + override CRUD library** — `hasPermission`, `requirePermission`, `requireAnyOf`, `PermissionDenied`; `upsertOverride` etc. with audit_log writes.
4. **Group D — verify + commit + PR**.

## Coverage estimate

- **Lines** target ≥ 80% on `src/lib/auth/`. Realistic 92% (most of the catalog is data; helpers have minimal branches).
- **Branches** target ≥ 90% on `src/lib/auth/`. Realistic 94%.
- **Stretch**: catalog-completeness fuzz that asserts every `Permission` literal appears in a base or app role set (already an explicit test, not a stretch).

## Risks (for Plan Mode reviewer)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P-1 | The catalog is large; getting one perm wrong now means changing it later requires walking every consumer. | Med | Reviewer walks PRD §9.3 + §9.4 against spec.md catalog before approval. Add at-least-one perm check as a permanent test. |
| P-2 | Duplicating the PLATFORM_ONLY list in DB trigger and TypeScript constant — drift risk. | Med | D-014 hardening adds a CI script that diffs the two; for now both are committed together. |
| P-3 | `Permission` as a giant literal union may hurt TS perf. | Low | Measure if observable; refactor to `string & { __brand: "perm" }` if needed. |
| P-4 | `requirePermission` thrown from a server action propagates a stack trace. | Low | `PermissionDenied` carries `user_id` + `perm` + `org_id` only; never the stack into client responses. |
| P-5 | `role_permission_overrides` UPDATE could change `mode` from deny to allow without re-checking PLATFORM_ONLY. | Low | Trigger fires on UPDATE too. |
| P-6 | Existing D-001 tests reference `'platform:manage'` and a few perms. After expanding the catalog those tests must keep passing. | Low | First task in Group A: re-run D-001 + D-002 suites after rbac.ts expansion to catch regressions early. |

## Out-of-scope reaffirmation

D-003 does NOT ship:
- Override authoring UI (D-005)
- Auto-suggest / templates (V2)
- Permission delegation (V2)
- Drift-detection CI script for the duplicated PLATFORM_ONLY lists (D-014 hardening)
- Per-action permission audit (D-004 super_admin drill-down)
