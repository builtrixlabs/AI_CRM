# Directive 302 — RLS audit suite + force-sign-out on suspend

**Kind:** feature (V3 / Phase A — auth & security hardening; closes Phase A)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Generated:** 2026-05-10
**Branch target:** `v3` (carried in PR [apps#42](https://github.com/builtrixlabs/AI_CRM/pull/42) alongside D-300/D-301)
**Source:** `docs/plans/v3-plan-v1.md` §3 D-302
**Builds on:** D-001 (RLS infrastructure), D-203 (`subscriptions.status` column), D-300 (`getCurrentUser` v3 contract)

---

## Problem

Two gaps to close before Phase A is shippable:

1. **No programmatic RLS audit.** D-001 set up tenant isolation via `auth.org_id()` + per-table USING policies, but we have spot-check tests only — no enumerative probe that for every public table, a user from org A cannot read/write rows owned by org B. v2's D-125 deferred this.
2. **Suspending an org doesn't actually block their users.** D-203's `subscriptions.status='suspended'` is DB-only — middleware doesn't read it, sessions don't refresh against it, and a user whose org was just suspended can keep using their access token until it expires (~1h).

D-302 closes both. **RLS audit** lands as a programmatic harness that enumerates every public table with an `organization_id` column, probes cross-org reads with two test-org fixtures, and asserts deny on every path. **Force-sign-out** lands as an `org_session_revocations` table + a check in `getCurrentUser` (the gateway every authenticated server-component / server-action passes through) so a suspended org's users are bounced to `/auth/sign-in` on their next request.

## Success criteria (production target 80/90)

### Schema (additive)

- [ ] **AC-1** Migration `supabase/migrations/<ts>_org_session_revocations.sql`:
  - `org_session_revocations(organization_id uuid PRIMARY KEY REFERENCES organizations(id), revoked_at timestamptz NOT NULL DEFAULT now(), revoked_by uuid NOT NULL, reason text NOT NULL)` — row exists iff org is currently suspended; deleted on reactivate. Audit history lives in `audit_log` (already trail-records suspend/reactivate via D-203).
  - RLS: super_admin only — `USING (app_is_super_admin())`. No tenant access.

### Force-sign-out

- [ ] **AC-2** `src/lib/auth/getCurrentUser.ts` extended:
  - After loading `profile.organization_id`, query `org_session_revocations` for that org.
  - If row exists → return `null` (treat user as unauthenticated; middleware redirects to `/auth/sign-in`).
  - One extra SELECT per authenticated request — minimal latency cost.

- [ ] **AC-3** `src/lib/platform/subscriptions.ts` extended:
  - `suspendOrg` — after the existing `subscriptions` UPDATE, INSERT `org_session_revocations` row (`organization_id`, `revoked_by=ctx.actor_id`, `reason`). Audit row keeps existing `subscription_suspended` action. Best-effort delete + re-insert if a stale row from a prior suspend exists (UPSERT semantics).
  - `reactivateOrg` — DELETE `org_session_revocations` row before the existing `subscriptions` UPDATE. Audit row keeps existing `subscription_reactivated` action.

- [ ] **AC-4** `src/app/auth/sign-in/page.tsx` post-auth check:
  - After `signInWithPassword` succeeds, fetch the user's profile + check `org_session_revocations`.
  - If revoked → call `supabase.auth.signOut()` to kill the just-issued session; render "Account suspended" error inline.
  - Magic-link / OAuth callback path is enforced by `getCurrentUser` on the next server-component render (which redirects to `/auth/sign-in`); the post-auth check is the immediate-feedback path for password sign-ins.

- [ ] **AC-5** **Out of scope for v3 MVP — documented limitation.** Direct revocation of in-flight access tokens (`auth.refresh_tokens`/`auth.sessions` cleanup) is not implemented. Token TTL is 1h by default; combined with the `getCurrentUser` revocation check on every server-rendered page + every server action, a suspended user is effectively unable to do anything within seconds. The 1h "stale-cache window" applies only to static-rendered or edge-cached responses, none of which are tenant-scoped in this app. V3.x adds explicit `auth.refresh_tokens` cleanup if needed.

### RLS audit suite

- [ ] **AC-6** `src/lib/security/rls-audit.ts` (new — pure, unit-testable):
  - `enumerateTenantTables(client)` → list of `{ table, has_organization_id, has_workspace_id }` from `information_schema.columns`.
  - `probeCrossOrgRead(client, table, org_id_other)` → run a SELECT-as-userA against rows owned by orgB; assert empty result.
  - `probeCrossOrgInsert(client, table, payload, org_id_other)` → attempt INSERT with foreign org_id; assert RLS rejection.
  - Pure functions, accept injected client for test mockability.

- [ ] **AC-7** `tests/integration/rls-audit.test.ts` (new — live-DB; excluded from default vitest run per existing convention):
  - `beforeAll` provisions two scratch orgs with one user each via service-role.
  - `it.each` over enumerated tables: as user A, attempt to read rows for org B → expect empty.
  - `it.each` over enumerated tables: as user A, attempt to insert with `organization_id = org B` → expect RLS error.
  - `afterAll` cleans up both fixture orgs.
  - Operator runs via `npm run test:rls-audit` (new package script).

- [ ] **AC-8** Pinpoint negative tests (also in `tests/integration/rls-audit.test.ts`) for the 5 highest-risk tables — `nodes`, `edges`, `node_signals`, `api_audit_log`, `org_integration_secrets` — each gets an explicit named case so failures point clearly at the offending policy.

- [ ] **AC-9** `tests/lib/security/rls-audit.test.ts` (new — unit, mocked DB):
  - `enumerateTenantTables` shape correctness from a fixture `information_schema.columns` payload.
  - `probeCrossOrgRead` returns the right pass/fail signal given a fake client.
  - `probeCrossOrgInsert` parses RLS errors correctly.

### Tests

- [ ] **AC-10** `tests/lib/auth/getCurrentUser.test.ts` extends with revocation cases:
  - User from active org → returns CurrentUser.
  - User from revoked org → returns null.
  - User without org_id (super_admin) → not affected by revocation check.

- [ ] **AC-11** `tests/lib/platform/subscriptions.test.ts` extends:
  - `suspendOrg` writes both `subscriptions.status='suspended'` AND `org_session_revocations` row.
  - `reactivateOrg` deletes the `org_session_revocations` row.
  - Idempotent suspend (second call) is a no-op on the revocations table (UPSERT or "row exists" check).

- [ ] **AC-12** Coverage on touched files: ≥80% lines / ≥90% branches.

- [ ] **AC-13** Gate-4 security scan: 0 CRITICAL after auto-fix loop.

## Non-goals (deferred to V3.x)

- **Direct token / session revocation in `auth.refresh_tokens`** — see AC-5; relies on 1h TTL + `getCurrentUser` check.
- **Per-user suspend** — only org-level suspend lands; per-user is `profiles.deactivated_at` (D-018), separate concern.
- **Revocation reason taxonomy** — free-text `reason` field; structured enum is V3.x.
- **Self-serve org-admin "freeze our own org" UX** — only platform-admin via `/platform/subscriptions/[id]` action.
- **Auto-reactivate on payment** — D-310 (Stripe) wires this when billing lands. v3 MVP requires platform-admin action.
- **RLS audit for non-public schemas** (`auth.*`, `storage.*`, mat views, RPC functions) — D-330 Phase D hardening.

## Stack

- **No new runtime deps.** Reuses existing `@supabase/supabase-js`.
- **New dev script:** `npm run test:rls-audit` invokes `vitest --config vitest.integration.config.ts` (or just `vitest run tests/integration/rls-audit.test.ts` with the `--include` override).
- **Migration only — additive.**

## Learned patterns applied

- **`tenant-isolation-via-jwt-claim`** — the audit suite's whole point is to verify this pattern holds enumerated.
- **`belt-and-suspenders-platform-only`** — suspend enforcement at TWO layers: DB (subscriptions.status) + app (getCurrentUser revocation check). Sign-in page adds a third for immediate UX feedback.
- **`injectable-supabase-client-for-tests`** — RLS-audit primitives accept an injected client.
- **`provenance-as-not-null-columns`** — `org_session_revocations.revoked_by` is NOT NULL.

## Authority

- Constitution V — **Bounded Authority** (the auth boundary must enforce, not just observe, account state).
- Supersedes: D-203 § AC-7 ("DB-only suspend; middleware doesn't block their session").

## Operator follow-ups (post-merge)

- [ ] Apply migration `<ts>_org_session_revocations.sql` to AI CRM Supabase prod.
- [ ] Run RLS audit against prod: `SUPABASE_URL=<...> SUPABASE_SERVICE_ROLE_KEY=<...> npm run test:rls-audit` — must show 0 leaks.
- [ ] Smoke test suspend → user bounced flow: `/platform/subscriptions/[id]` → "Suspend" → confirm a user from that org bounces to `/auth/sign-in` on next request.
- [ ] Add D-302 status to V2_STATUS / V3 plan V3.x backlog: refresh-token cleanup landed (or not, with rationale).
