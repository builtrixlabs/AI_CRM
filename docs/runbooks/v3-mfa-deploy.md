# Runbook — D-300 deploy checklist (real TOTP MFA)

**One-time setup** when promoting `v3` to a deployable environment (Preview or Production). Skip the steps already done.

---

## 1. Generate the encryption key

D-300 stores TOTP secrets encrypted at rest with AES-256-GCM. The key is required in production — the app boots fail-fast if missing.

```sh
openssl rand -hex 32
# → 64 hex chars (32 bytes). Treat like a password.
```

Store the value in 1Password / vault under "AI CRM — MFA_ENCRYPTION_KEY (prod)" / "(preview)". Never commit to git. Never rotate without a migration plan (rotation isn't supported in v3 MVP — `key_version` is reserved for V3.x).

## 2. Set Vercel env vars

Project → Settings → Environment Variables. Add for each scope you're deploying:

| Name | Value | Scope |
|---|---|---|
| `MFA_ENCRYPTION_KEY` | the 64-hex-char value from step 1 | Production · Preview (v3) |
| `MFA_FRESHNESS_HOURS` | `8` (default) — override only if you have a reason | optional |
| `MFA_DEMO_MODE` | **leave unset** in Production. See [demo-mode.md](demo-mode.md). | Preview only when running a demo URL |

After saving env vars, **redeploy** so the new build picks them up (Vercel doesn't propagate env changes to a running deployment).

## 3. Apply the migration

```sh
npx supabase link --project-ref <ref>   # one-time
npx supabase db push                     # applies 20260510120000_profiles_mfa_secret.sql
```

The migration is additive — no data loss, no down-migration needed. It adds three columns on `public.profiles`:
- `mfa_secret jsonb` — encrypted payload `{iv, ciphertext, alg, key_version}`.
- `mfa_recovery_codes jsonb` — array of `{hash, used_at, used_from_ip}` (10 entries at enroll).
- `mfa_enrolled_at timestamptz` — NULL = not yet enrolled.

RLS is unchanged — `profiles` already has tenant-scoped policies from D-001.

## 4. Smoke test (any non-demo Preview)

1. Sign in as a test user (org_admin role recommended).
2. Navigate to `/admin/billing`.
   - **Expected**: redirect to `/auth/mfa/setup?return=%2Fadmin%2Fbilling`.
3. On the setup page:
   - QR renders (visible image).
   - 10 recovery codes shown in a 2-col grid.
   - Manual-entry secret string shown below the QR.
4. Scan the QR with an authenticator app (Authy / 1Password / Aegis / Google Authenticator).
5. Enter the 6-digit code → submit.
   - **Expected**: redirect back to `/admin/billing` with the page rendering.
6. Reload `/admin/billing` immediately → no MFA redirect (within freshness window).
7. Wait > 8 hours OR manually clear `mfa_verified_at` in Supabase, then revisit `/admin/billing`.
   - **Expected**: redirect to `/auth/mfa?return=%2Fadmin%2Fbilling`.
8. Submit a fresh code from authenticator → access restored.
9. Recovery flow:
   - Click "Use a recovery code instead".
   - Submit one of the codes saved at enrollment.
   - **Expected**: redirect to `/admin/billing`. The code is now consumed.
   - Re-attempt with the same code → "That recovery code has already been used."
10. Audit-log query:
    ```sql
    select action, created_at from audit_log
    where actor_id = '<test-user-uuid>' and action like 'mfa.%'
    order by created_at desc limit 10;
    ```
    Expect rows for `mfa.enrolled`, `mfa.verified` (×2), `mfa.recovery_code_used` (×1).

## 5. Production cutover

1. Confirm Step 1 + 2 done with **production-scoped** values.
2. `npx supabase db push` against the production project ref (`bwumqahgwobwghlmzcrl`).
3. Deploy `v3` → `main` (after the v3.0 acceptance run).
4. Smoke as in Step 4 against the production URL with a real super_admin account. **Use a real authenticator app** — do not rely on `MFA_DEMO_MODE`.
5. Communicate to existing org_admins that they'll be redirected to `/auth/mfa/setup` on their next sensitive-route visit. ETA for enrollment: ~90 seconds per user.

## 6. Lost-device unblock (operator-led)

If a user loses both their authenticator and recovery codes, the only unblock path is a platform-admin reset:

```sql
-- Confirm the user_id first via /platform/users/[id] or auth.users.email lookup.
update public.profiles
set mfa_enrolled_at = null,
    mfa_verified_at = null,
    mfa_secret = null,
    mfa_recovery_codes = null
where id = '<user-uuid>';

-- Audit:
insert into public.audit_log
  (actor_id, actor_type, actor_role, organization_id, table_name,
   record_id, action, diff)
values
  ('<platform_admin_user_id>', 'user', 'super_admin', null,
   'profiles', '<user-uuid>', 'mfa.reset',
   '{"reason": "lost_device", "ticket": "<support_ticket_id>"}');
```

This is a manual platform-admin action for v3 MVP; a self-serve org-admin reset UI is V3.x.

## 7. Rollback

D-300 is **not safely rollback-able** at the data layer:
- The v2 click-stub at `/auth/mfa` is gone.
- `profiles.mfa_secret` rows are encrypted — decrypting requires `MFA_ENCRYPTION_KEY` and the v3 code.
- The schema change is forward-compatible; the columns are nullable so a v2 build will silently ignore them.

If you must roll back to v2 code:
1. Revert the deploy (Vercel deploys are versioned).
2. The schema columns stay — they're additive, no DB migration needed.
3. Existing enrolled users will *lose* their MFA gate (v2 only had the advisory banner).
4. Any data they generated via /auth/mfa* (encrypted secrets, hashed codes) is preserved for re-enable when v3 lands again.

A clean re-deploy of v3 picks up where it left off.

## 8. Known gaps (V3.x)

Surfaced by the D-300 Gate-4 security scan and tracked in [docs/plans/v3-plan-v1.md](../plans/v3-plan-v1.md) §7:

- BCRYPT_COST = 10 — meets OWASP 2023 minimum; bump to 12 in V3.x once perf budget allows.
- No runtime warning when `MFA_DEMO_MODE=true` in `NODE_ENV=production` — purely operational guardrail.
- No `mfa.reset` action wired to a UI — platform-admin runs SQL per Step 6 above.
- Multi-instance rate-limit on `/auth/mfa` — single-instance only until D-301 (Vercel KV).
- Trusted-device "remember me" cookie — every device re-verifies per freshness window.
- `key_version` field is reserved on `mfa_secret` payload but no rotation tooling yet.

## 9. References

- Spec: [directives/300-real-totp-mfa.md](../../directives/300-real-totp-mfa.md)
- Plan: [docs/plans/v3-plan-v1.md](../plans/v3-plan-v1.md) §3 D-300
- Demo bypass: [demo-mode.md](demo-mode.md)
- Lib: [src/lib/auth/totp.ts](../../src/lib/auth/totp.ts), [recovery-codes.ts](../../src/lib/auth/recovery-codes.ts)
- Migration: [supabase/migrations/20260510120000_profiles_mfa_secret.sql](../../supabase/migrations/20260510120000_profiles_mfa_secret.sql)
