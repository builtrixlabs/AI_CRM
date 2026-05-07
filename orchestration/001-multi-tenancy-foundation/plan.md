# Plan — 001-multi-tenancy-foundation

## Files to be created

### Migrations (`supabase/migrations/`)

| File | Lines (~) | Purpose |
|---|---|---|
| `20260507120000_orgs_and_workspaces.sql` | 130 | organizations, workspaces, teams + JWT-claim helper function `auth.org_id()` |
| `20260507120100_users_and_auth.sql` | 80 | `base_role` enum + `profiles` table + auth.users trigger that backfills profile on confirmed signup |
| `20260507120200_user_app_roles_bridge.sql` | 70 | `user_app_roles` table + composite unique index |
| `20260507120300_audit_log.sql` | 90 | `audit_log` table + append-only RLS (INSERT-only for service_role; SELECT scoped; no UPDATE/DELETE policy) |
| `20260507120400_rls_policies.sql` | 150 | Enable RLS + select/write policies on each domain table; positive AND negative coverage |

> Filenames use the V5 timestamp-prefix convention; `001-005` numbering in the install plan
> is logical, not physical — Supabase orders migrations lexically.

### Application code (`src/`)

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/supabase/server.ts` | 30 | server-side Supabase client (cookie-based) |
| `src/lib/supabase/admin.ts` | 25 | service-role client (server actions only; flagged at import) |
| `src/lib/auth/types.ts` | 40 | `BaseRole`, `AppRole`, `CurrentUser`, `Permission` type definitions |
| `src/lib/auth/getCurrentUser.ts` | 70 | resolves `{ user, profile, org_id, workspace_ids[], app_roles[] }` |
| `src/lib/auth/rbac.ts` | 120 | `effectivePermissions(...)` resolver + `PLATFORM_ONLY_PERMISSIONS` set (shell; full catalog in D-003) |
| `src/lib/auth/route-policy.ts` | 60 | pure function `decideRoute(user, pathname) → { kind: 'allow' \| 'redirect' \| '401', target?: string }` |
| `src/middleware.ts` | 50 | edge middleware that calls `decideRoute` and emits 302 / 401 |
| `src/app/auth/sign-in/page.tsx` | 60 | magic-link form (Supabase Auth) |
| `src/app/auth/callback/route.ts` | 30 | Supabase OAuth-callback exchange |
| `src/app/(platform)/platform/page.tsx` | 15 | placeholder |
| `src/app/(admin)/admin/page.tsx` | 15 | placeholder |
| `src/app/(dashboard)/dashboard/page.tsx` | 15 | placeholder |
| `src/app/api/auth/whoami/route.ts` | 25 | GET → CurrentUser JSON (used by tests) |
| `src/app/403/page.tsx` | 15 | "Access forbidden" page |
| `src/app/layout.tsx` | 30 | minimal root layout (font + html lang) |
| `src/app/page.tsx` | 20 | landing redirect (`/` → `/dashboard` if auth, else `/auth/sign-in`) |
| `src/app/globals.css` | 10 | Tailwind base directives |
| `next.config.ts` | 15 | minimal Next.js 16 config |
| `tailwind.config.ts` | 25 | shadcn-compatible Tailwind config (CSS variables) |
| `postcss.config.mjs` | 5 | postcss + tailwind |

### Scripts

| File | Lines (~) | Purpose |
|---|---|---|
| `scripts/bootstrap-super-admin.sh` | 80 | idempotent provisioning of first super_admin |

### Tests

| File | Type | Lines (~) | Purpose |
|---|---|---|---|
| `tests/lib/auth/rbac.test.ts` | Vitest unit | 150 | three-layer resolver — base, bridge, allow, deny, deny-wins, PLATFORM_ONLY enforcement, NULL workspace_id semantics |
| `tests/lib/auth/route-policy.test.ts` | Vitest unit | 100 | pure routing decisions for all 8 (role × surface) cases |
| `tests/lib/auth/getCurrentUser.test.ts` | Vitest unit | 80 | resolves correctly with mocked Supabase client; returns null when unauthed |
| `tests/integration/audit-log-immutable.test.ts` | Vitest integration (real DB) | 60 | UPDATE/DELETE on audit_log throw for every role |
| `tests/integration/rls-org-isolation.test.ts` | Vitest integration | 100 | sales_rep in Org A SELECTs from `profiles` returns only Org A rows |
| `tests/integration/rls-super-admin-zero.test.ts` | Vitest integration | 80 | super_admin SELECTs from operational tables returns 0 rows |
| `tests/integration/rls-channel-partner.test.ts` | Vitest integration | 80 | CP A cannot read CP B's submissions (uses placeholder `cp_submissions` test table; D-002 will replace with real `leads`) |
| `tests/e2e/auth-redirects.spec.ts` | Playwright @smoke | 120 | full HTTP flow: sign-in as each role, hit each surface, assert 302 target |
| `tests/e2e/cross-tenant-leak.spec.ts` | Playwright @regression | 80 | two orgs, prove cross-tenant data isolation via API responses |

## Files to be modified

| File | Change |
|---|---|
| `package.json` | add deps: `@supabase/ssr` (already present), `@supabase/supabase-js` (already present); add devDeps: nothing new |
| `.env.example` | add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF` placeholders (for V5 / Next.js naming) |
| `tsconfig.json` | confirm `strict: true`, `paths: { "@/*": ["./src/*"] }` |

## Migrations applied via

```
supabase migration up --linked        # applies to bwumqahgwobwghlmzcrl preview branch
```

The CI pipeline runs `supabase db reset` against a preview branch before tests.

## Tests (TDD order — RED → GREEN → REFACTOR per task)

The order is encoded in [tasks.md](tasks.md). Briefly:

1. Pure unit tests first (rbac, route-policy) — no DB.
2. Migrations land alongside their integration tests (RED until migration applied).
3. Middleware + sign-in pages last (depend on lib/auth).
4. E2E smoke + regression run after the unit + integration suites pass.

## Coverage estimate

- **Lines**: target ≥ 80% on `src/lib/auth/`. Realistic 88% with current plan (uncovered = error branches in `getCurrentUser` for malformed JWT).
- **Branches**: target ≥ 90% on `src/lib/auth/`. Realistic 92%.
- **Stretch (`@stretch` tag)**: fuzz the RBAC resolver with property-based tests (fast-check). Not blocking.

## Risks (for Plan Mode reviewer to weigh)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P-1 | Custom JWT claim (`organization_id`) requires Supabase Auth Hook (Postgres function on `auth.jwt`). If we get this wrong, every RLS policy breaks at runtime. | High | Author hook in 002 migration; integration test asserts JWT contains `organization_id` after sign-in. |
| P-2 | Edge middleware can't talk to Supabase via `@supabase/ssr` cleanly in Next.js 16; might need to read JWT cookie manually. | Medium | If `@supabase/ssr` middleware integration is shaky, fall back to JWT decode in middleware (verify against JWKS). Document choice. |
| P-3 | `audit_log.organization_id` is nullable to support `actor_type='system'` rows (e.g. bootstrap). RLS SELECT policy must handle NULL gracefully. | Medium | Policy: `organization_id IS NOT DISTINCT FROM auth.org_id() OR (action LIKE 'platform_%' AND auth.is_super_admin())`. |
| P-4 | We're shipping the RBAC `effectivePermissions` shell with no real permission catalog. Tests can pass while exposing nothing meaningful. | Low | Test 7 specific (role × permission) cases that *do* matter for the redirect logic. Full catalog (~120 perms) lands in D-003. |
| P-5 | Bootstrap script needs `SUPABASE_SERVICE_ROLE_KEY` in env — we don't have it yet. | Blocks AC-17/18 only | Implement script + integration test (mocked); manual e2e proof when key is added. |
| P-6 | The `channel_partner` isolation test uses a placeholder `cp_submissions` table (since `leads` lands in D-002). Risk: D-002 changes the test, and we forget to keep the property covered. | Low | Test file header carries an `OWNED-BY: D-001 + D-002` comment; D-002 plan must update it. |
| P-7 | OneDrive sync racing with Supabase CLI temp files (Windows-specific). | Low | Run `supabase migration up` from inside a non-OneDrive working copy if it acts up; document in install-plan. |

## Out-of-scope reaffirmation (cross-check with directive)

This plan does **not** include:
- agent runtime, service accounts, tier ceilings (D-009)
- pgvector, `nodes`, `edges`, `node_signals` (D-002)
- ~120-permission catalog, override admin UI (D-003)
- super_admin /platform sub-routes (orgs CRUD, billing, etc. — D-004)
- /admin cockpit cards, onboarding wizard (D-005)
- Canvas component (D-006)
- shadcn install (deferred to D-004)
- Inngest, Model Gateway, embeddings (D-009)
- WhatsApp/email/telephony integrations
