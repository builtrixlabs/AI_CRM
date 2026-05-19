# Directive 606 — Super Admin V6 Capabilities

**Kind:** feature (V6 Phase 3, step 3.4 — operator tooling: impersonation + audit viewer + defects + feature flags)
**Status:** AUTHORIZED — operator cleared Phase 3 to run end-to-end 2026-05-19 ("D-616 → D-606 → D-612 → D-611, autonomous").
**Branch target:** `v6.3` (Phase 3 phase branch, cut from `v6.2.2@f112d6c`).
**Generated:** 2026-05-19T13:30:00Z
**Source:** `docs/PRD-v6.0.md` §D-606 (lines 486-545); `docs/plans/v6-implementation-order.md` §4 step 3.4.
**Builds on:** D-004 (super admin surface), D-001 (`audit_log.on_behalf_of` already exists for impersonator provenance), D-202 (platform analytics page pattern), D-302 (force-signout / session revocations), D-310 (Stripe-driven `plan_tier`).

---

## Problem

Super admin today has organization CRUD, audit log, analytics, and tickets — but no way to **walk in a customer's shoes** when they report a defect. The four surfaces D-606 ships:

1. **Impersonation** — super admin starts a 30-min impersonation session on a target org; lands on `/admin` (or `/dashboard`) as that org's `org_admin`; banner across every page reminds them; every action is audit-logged with `actor_id=super_admin_id, on_behalf_of=target_org_id` provenance.
2. **Audit viewer with user filter** — existing `/platform/audit` extended with a `user_id` filter so super admin can scope to a specific actor.
3. **Defect tracking** — `/platform/defects` CRUD for incidents (severity, status, related audit ids).
4. **Per-org feature flags** — `organizations.feature_flags jsonb` editor at `/platform/organizations/[id]/features`; an `isFeatureEnabled(org, flag)` helper makes gates trivial; PRD's per-org plan tier override is the same edit field on the org detail page (no new UI).

---

## Architecture decisions

- **Impersonation is a cookie overlay on `getCurrentUser()`, not a JWT re-issuance.** Re-issuing a Supabase JWT for a different user would require auth-server changes the V6 pilot does not need. The overlay is a signed cookie (`impersonation_session`) read on every `getCurrentUser()` call. When valid, the function returns a `CurrentUser` with `org_id = target_org_id`, `profile.base_role = 'org_admin'`, and a new `impersonation` field carrying impersonator id + organization + start/end timestamps. The underlying auth user id (super admin's) is preserved in `user.user.id` + `profile.id`, so every audit_log row already tags the right `actor_id` — provenance is automatic.
- **`audit_log.on_behalf_of` is the impersonation provenance.** The column already exists (D-001 / `20260507120300_audit_log.sql:13`). A new shared helper writes both `actor_id` and `on_behalf_of` (the impersonated org_id) on every audit row produced under an impersonation session. No new column on `audit_log`.
- **Why the cookie overlay works for both reads and writes.** Every lib function uses `getSupabaseAdmin()` (service role) with an explicit `organization_id` filter sourced from `user.org_id`. The overlay swaps that source value to the target org — every read + write naturally targets the impersonated org. RLS-gated authenticated-client paths are rare in the V6 codebase; documented in Risks.
- **Cookie signature is HMAC-SHA256 over `${impersonator_id}|${target_org_id}|${started_at_iso}|${expires_at_iso}`** with `INTEGRATION_ENCRYPTION_KEY` (the same secret D-432–D-435 use for per-org credentials, so no new secret to provision). The signature is verified server-side on every read; tampering → cookie ignored → super admin sees their normal home page.
- **30-min fixed window.** PRD says "auto-exit after 30 min inactivity"; D-606 ships a 30-min **fixed** window from start (simpler than a sliding-window middleware refresh that would require touching every authenticated request). The operator can extend by re-starting impersonation; sliding inactivity is a V6.x polish.
- **Reason >= 10 chars on start.** PRD migration §D-606 ships a CHECK constraint on `super_admin_impersonation_log.reason`; the start form requires it.
- **Defects are a lightweight CRUD, no workflow engine.** `platform_defects` rows have status `open/triaged/in_progress/resolved/wont_fix`, severity `P0-P3`, optional `related_audit_ids[]`, `assigned_to`, `resolved_at`. List + detail pages, no SLA timers, no email integration — V6.x.
- **Feature flags are a free-form jsonb the platform writes + libs read.** `isFeatureEnabled(org_id, flag_name, default = false)` returns the boolean at `organizations.feature_flags->>flag_name`. D-606 ships the infrastructure; wiring specific UI surfaces to flags is incremental V6.x work (e.g. gating `/dashboard/recovery` on `recovery_team_enabled`).
- **Org-tier override = the existing `organizations.plan_tier` column.** PRD calls out "ability to set custom plan beyond Stripe-driven tier"; this is already editable via `editOrganization` from the platform side. The audit-trail piece is already in place via `D-310`'s billing edits. D-606 documents this as already-shipped — no new code.
- **All four surfaces gated on `platform:manage`.** A new `platform:impersonate` permission would just duplicate `platform:manage` for V6's threat model (super admin already has the keys to the kingdom); we avoid the perm sprawl.

---

## Success criteria

- [ ] **AC-1** Super admin clicks "Start impersonation" → enters a reason ≥ 10 chars → lands on the target org's `/admin` → banner "IMPERSONATING <org name> — Exit" visible on every page they navigate. A `super_admin_impersonation_log` row records start (id, super_admin_id, organization_id, started_at, reason).
- [ ] **AC-2** While impersonating, any action that writes `audit_log` carries `actor_id = super_admin_user_id` AND `on_behalf_of = target_org_id` — proven by an integration test that calls `writeAuditWithImpersonation` and asserts the row shape.
- [ ] **AC-3** Clicking "Exit" → cookie cleared → super admin lands on `/platform/organizations/<id>` → the `super_admin_impersonation_log` row's `ended_at` is set. A cookie past `expires_at` is treated as invalid (the overlay returns the super admin's normal context).
- [ ] **AC-4** `/platform/audit` accepts `user_id=` in the query string and filters by `audit_log.actor_id`, alongside the existing `organization_id` / `action` / `from` / `to` filters.
- [ ] **AC-5** `/platform/defects` lists open + recently-resolved defects with severity + assignee. Create / edit / resolve all work; resolving sets `status='resolved'` and `resolved_at = now()`. Cross-tenant: a defect with a specific `organization_id` is readable + editable only by super admin (the `platform:manage` gate).
- [ ] **AC-6** `/platform/organizations/[id]/features` shows a key/value editor over `organizations.feature_flags`; toggling a known flag persists; `isFeatureEnabled(org, flag)` returns the new value on the next request.
- [ ] **AC-7** Cross-tenant safety: the cookie's `impersonator_id` is verified against the live `auth.getUser().id` on every overlay read — if a stolen cookie is replayed from another browser, the overlay returns the cookie-holder's normal context, not the target org. Tested by a unit test of `verifyImpersonationCookie`.
- [ ] **AC-8** RBAC: every D-606 page + action is gated on `platform:manage`. A non-super_admin who somehow lands on `/platform/organizations/[id]/impersonate` gets `redirect("/403")`.
- [ ] **AC-9** Tests: `impersonation.test.ts` (sign/verify/expiry), `defects.test.ts` (CRUD + permission gate), `feature-flags.test.ts` (toggle + `isFeatureEnabled`), `audit-user-filter.test.ts` (the new `actor_id` filter), `impersonation-banner.test.tsx` (RTL), `platform-impersonation.test.ts` (integration). `npx tsc --noEmit` clean for changed files; targeted vitest suite green.
- [ ] **AC-10** All 10 V6 stopping-criteria gates pass. Migration `20260519130000_super_admin_v6.sql` applies; `scripts/verify_606.mjs` PASS against live Supabase.

---

## Non-goals (deferred to V6.x)

- **JWT-level impersonation.** The cookie overlay is sufficient for the V6 pilot operator-support workflow. Re-issuing a real Supabase JWT (so the impersonated user sees the org via their own RLS-gated authenticated client) is V6.x.
- **Sliding-window inactivity expiry.** Fixed 30-min window from start. Operator clicks Exit to end early; auto-expire fires deterministically.
- **Defect-to-Linear/Jira sync.** Defects are local-only.
- **Feature flag UI-surface gating beyond the infrastructure.** D-606 ships `isFeatureEnabled`; wiring specific surfaces to flags is per-surface follow-up.
- **A separate `platform:impersonate` permission.** `platform:manage` is the existing super_admin gate; no perm-sprawl in V6.
- **Per-org plan tier override UI.** `organizations.plan_tier` is already editable from the platform-side organization detail page (the field exists; the form lives in `/platform/organizations/[id]/edit`). D-606 ships no new code here — documented as already-shipped.

---

## Stack

- **New:** `supabase/migrations/20260519130000_super_admin_v6.sql`, `src/lib/platform/impersonation.ts`, `src/lib/platform/defects.ts`, `src/lib/platform/feature-flags.ts`, `src/lib/audit/impersonation-aware.ts` (the shared `writeAuditWithImpersonation` helper), `src/app/(platform)/platform/organizations/[id]/impersonate/{page,actions}.tsx`, `src/app/(platform)/platform/organizations/[id]/features/{page,actions}.tsx`, `src/app/(platform)/platform/defects/page.tsx`, `src/app/(platform)/platform/defects/[id]/page.tsx`, `src/app/(platform)/platform/defects/actions.ts`, `src/app/api/platform/impersonate/exit/route.ts`, `src/components/platform/impersonation-banner.tsx`, `scripts/verify_606.mjs`, plus tests.
- **Modified:** `src/lib/auth/types.ts` (add `impersonation` to `CurrentUser`), `src/lib/auth/getCurrentUser.ts` (overlay), `src/app/(platform)/platform/audit/page.tsx` + `src/lib/platform/queries.ts` (`user_id` filter), `src/app/layout.tsx` (mount `ImpersonationBanner`).
- **Reuses:** existing `INTEGRATION_ENCRYPTION_KEY` for HMAC (no new env), the platform tickets / orgs admin page layouts, `getSupabaseAdmin`, the V0 audit_log shape (`on_behalf_of` exists already).
- **DB:** two new tables (`super_admin_impersonation_log`, `platform_defects`) + one column add (`organizations.feature_flags`). No destructive change.
- TDD enforced. Branch deploys only.

---

## Authority

- **PRD-v6.0 §D-606** — the four sub-surfaces, the data model (verbatim), the `platform:manage` gate, the impersonation expiry contract.
- **Implementation-order §4 step 3.4** — "Per-org impersonation (audit-logged), user action log viewer, defect tracking module, per-org feature flag matrix, per-org subscription tier override."
- **Constitution III + IV** — every state-changing action audit-logged + immutable; impersonation provenance via `on_behalf_of`.
- **Constitution VIII** — `platform:manage` exists in the literal RBAC catalog; no new perm needed.

---

## Operator follow-ups (post-merge)

- [ ] **Apply migration**: `node --env-file=<parent>/.env scripts/apply_migration.mjs supabase/migrations/20260519130000_super_admin_v6.sql`, then `node --env-file=<parent>/.env scripts/verify_606.mjs`.
- [ ] **Smoke**: as super admin, start an impersonation on a test org (reason: "spot-check"); confirm banner appears; navigate `/admin/leads`, see the org's data; click Exit; confirm the impersonation_log row's `ended_at` is set; verify an audit_log row from the impersonation carries `on_behalf_of=<test_org_id>`.

---

## Risks & decisions

- **Cookie tamper / replay.** Cookie is HMAC-SHA256 signed; overlay verifies signature + cross-checks `impersonator_id` against the live `auth.getUser().id` (catches replay from another session). Tampering → invalid signature → overlay ignored. Cookie is `HttpOnly` + `Secure` + `SameSite=Lax`.
- **Authenticated-client reads inside impersonation.** Any code path using `createSupabaseServerClient()` (the JWT-bearing client, not the service role) will continue to see the super admin's home org via RLS. V6 codebase uses `getSupabaseAdmin()` for nearly all org-data reads (the canonical caller-org-filter pattern), so impact is minimal — documented as a V6.x JWT-impersonation follow-up.
- **`getCurrentUser()` is request-cached.** The overlay reads the cookie inside the cached function, so cookie changes within a request don't propagate (a Start in the same request still returns the super admin's normal context until the next request). Acceptable — Start always redirects.
- **A super admin who loses `platform:manage` mid-session.** Overlay re-checks the permission on every read. Loss of perm → overlay ignored → session effectively terminated (but the `super_admin_impersonation_log` row remains "open" until the cookie expires).
- **`feature_flags` jsonb has no schema.** By design — different flags have different shapes; the helper coerces a missing/non-boolean value to `false`. Schema enforcement is per-call.

---

## Learned Patterns Applied

- **`caller-org-filter-on-service-role-read`** — every defect / flag / impersonation lib query runs on `getSupabaseAdmin()` and filters by `organization_id` where applicable; the integration test proves cross-org isolation.
- **`signed-cookie-overlay`** — the impersonation cookie is an HMAC-SHA256-signed token, verified server-side on every overlay read. Same pattern the per-org integration credentials use for tamper-evidence.
- **`server-action-result-discriminated-union`** — every D-606 action returns `{ ok: true } | { ok: false, reason }`.
- **`additive-only-migrations`** — two `IF NOT EXISTS` tables + one `ADD COLUMN IF NOT EXISTS`; explicit `ROLLBACK:` block; no destructive change.
