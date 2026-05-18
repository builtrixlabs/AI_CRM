# Runbook — D-302 RLS audit + force-sign-out

**One-time setup** when promoting D-302 (`v3` Phase A close-out) to a deployable environment.

---

## 1. Apply the migration

```sh
npx supabase link --project-ref bwumqahgwobwghlmzcrl   # one-time
npx supabase db push                                     # applies 20260510120100_org_session_revocations.sql
```

The migration is additive:
- New `public.org_session_revocations(organization_id PK, revoked_at, revoked_by, reason)`.
- Super-admin-only RLS (4 policies).
- New `public.app_is_org_revoked(uuid)` SECURITY DEFINER function — exposes only an existence bit so regular users' `getCurrentUser` can fast-path the revocation check.
- `NOTIFY pgrst` at the end so PostgREST sees the new objects without a restart.

No data migration. No down migration needed (table is append-on-suspend / delete-on-reactivate; an empty table = no orgs revoked = no behaviour change).

## 2. Run the RLS audit suite

```sh
SUPABASE_URL="https://bwumqahgwobwghlmzcrl.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
SUPABASE_PUBLISHABLE_KEY="..." \
npm run test:rls-audit
```

What it does:

1. Provisions two scratch orgs (`rls-audit-org-a`, `rls-audit-org-b`) with one user each, signs them in via real Supabase auth.
2. Enumerates every public table that carries `organization_id` (excluding the documented platform-default tables — see [src/lib/security/rls-audit.ts](../../src/lib/security/rls-audit.ts) `RLS_AUDIT_EXCLUDE_TABLES`).
3. As user A, attempts to SELECT rows owned by org B → **expects 0 rows** on every table.
4. Pinpoint cases for the 5 highest-risk tables (`nodes`, `edges`, `node_signals`, `api_audit_log`, `org_integration_secrets`) — explicit named tests so failures point at the offending policy.
5. INSERT-as-user-A with `organization_id = org B` on `nodes` → **expects RLS rejection**.
6. `afterAll` cleans up both scratch orgs + their users.

**Pass condition: every table green, 0 leaks.** Any leak surfaces a missing `USING (organization_id = auth.org_id())` policy that needs fixing before merge.

## 3. Smoke test the suspend → forced-sign-out flow

Pre-req: a real super_admin and a real org with at least one user.

1. Sign in as super_admin → navigate to `/platform/subscriptions`.
2. Find the test org → click "Suspend" → enter reason.
3. **Expected DB state** (verify via Supabase SQL editor):
   ```sql
   select status from subscriptions where organization_id = '<org-uuid>';   -- 'suspended'
   select * from org_session_revocations where organization_id = '<org-uuid>';   -- 1 row
   ```
4. In another browser, signed in as a user from that org, navigate anywhere (e.g. `/dashboard`).
5. **Expected**: redirect to `/auth/sign-in` (their session is still valid at the Supabase layer, but `getCurrentUser` returns null because of the revocation row).
6. On `/auth/sign-in`, attempt password sign-in:
   - **Expected**: red error message — "Your session can't be activated. Your organization may be suspended — contact your admin or support."
   - The `whoami` call after Supabase auth returns `{user: null}`, sign-out is auto-triggered, error shown.
7. As super_admin: navigate back to `/platform/subscriptions` → click "Reactivate".
8. **Expected DB state**:
   ```sql
   select status from subscriptions where organization_id = '<org-uuid>';   -- 'active'
   select * from org_session_revocations where organization_id = '<org-uuid>';   -- 0 rows
   ```
9. As the org user: sign in → access works again.

## 4. Audit-log query

```sql
select action, diff, created_at
from audit_log
where action in ('subscription_suspended', 'subscription_reactivated')
order by created_at desc limit 10;
```

Expect alternating `_suspended` (with `diff.reason`) and `_reactivated` rows.

## 5. Documented limitation — token TTL window

When suspend fires, the user's existing access token isn't actively invalidated at the Supabase layer (no `auth.admin.signOut(user_id)` API exists in supabase-js). What protects them:

- **App-layer enforcement**: every server-rendered page + every server action calls `getCurrentUser`, which now returns null for revoked orgs. They get 401 / redirect on the very next request.
- **Token TTL**: Supabase access tokens expire after 1h by default. Refresh fails to materialize a new token because `getCurrentUser` returns null for the next page load.
- **Rate-limiter**: any cached attempts that bypass `getCurrentUser` (none today) would hit `lookupBucket` etc. anyway.

What's NOT protected:
- A static-rendered page with no `getCurrentUser` call would still be served. There are no such pages in the current app — every operational surface is a server component that calls `getCurrentUser`. This is documented in V3.x backlog.

## 6. Rollback

D-302 is **safely rollback-able**:

1. Revert the deploy on Vercel.
2. The `org_session_revocations` table sits dormant. No orphan rows are problematic — the previous build doesn't read them.
3. If a row exists for an org (suspended), the next code that reads the table is the re-deploy of D-302+ — at which point the user is again gated. Reactivate clears the row.

To explicitly drop the table:
```sql
drop function if exists public.app_is_org_revoked(uuid);
drop table if exists public.org_session_revocations cascade;
```
But this should not be necessary — additive migrations are forward-safe.

## 7. Operator follow-ups (post-merge)

- [ ] `npx supabase db push` to apply the migration to AI CRM Supabase prod.
- [ ] `npm run test:rls-audit` against prod — must show 0 leaks.
- [ ] Smoke test suspend → forced-sign-out per Step 3 above.
- [ ] Update [docs/V2_STATUS.md §3](../V2_STATUS.md) "D-203 subscriptions — force-sign-out users on suspend" entry → mark closed by D-302.
- [ ] Tag `v3.0` after green Phase A acceptance (D-300 + D-301 + D-302 all merged).

## 8. Known gaps (V3.x)

Surfaced by the spec's AC-5 + the security scan:

- **No active token revocation** — relies on TTL + app-layer check. V3.x can add a `delete from auth.refresh_tokens where user_id = ?` ON suspend for immediate invalidation.
- **`getCurrentUser` adds 1 RPC per authenticated request** — small cost (~5-15ms). If profiled hot, V3.x can cache via JWT custom claim refreshed on token issuance.
- **Org-admin self-serve "freeze our own org"** — only platform-admin can suspend today; org-admin escalation flow is V3.x.

## 9. References

- Spec: [directives/302-rls-audit-and-force-signout.md](../../directives/302-rls-audit-and-force-signout.md)
- Plan: [docs/plans/v3-plan-v1.md](../plans/v3-plan-v1.md) §3 D-302
- Library: [src/lib/security/rls-audit.ts](../../src/lib/security/rls-audit.ts), [src/lib/auth/getCurrentUser.ts](../../src/lib/auth/getCurrentUser.ts), [src/lib/platform/subscriptions.ts](../../src/lib/platform/subscriptions.ts)
- Migration: [supabase/migrations/20260510120100_org_session_revocations.sql](../../supabase/migrations/20260510120100_org_session_revocations.sql)
- Companion: [v3-mfa-deploy.md](v3-mfa-deploy.md), [v3-rate-limit-deploy.md](v3-rate-limit-deploy.md)
