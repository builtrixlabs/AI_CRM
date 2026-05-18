# Runbook — MFA demo bypass (`MFA_DEMO_MODE`)

**Owner:** operator (deployer-side)
**First applies:** D-300 (V3 / Phase A — real TOTP MFA)
**Supersedes:** D-209 banner-bypass behavior (banner removed in D-300 slice 3)

---

## What it does

When `MFA_DEMO_MODE=true` is set in the runtime env, the V3 hard MFA redirect is short-circuited at the edge. Authenticated users land on `/platform/*`, `/admin/billing`, `/admin/integrations/*`, `/settings/users`, `/settings/roles`, `/admin/webhooks` without being bounced to `/auth/mfa[/setup]`.

This preserves the v2 demo runbook — a scripted walkthrough can hit every sensitive surface without an enrollment detour.

The audit log still records every state transition (`mfa.enrolled`, `mfa.verified`, `mfa.recovery_code_used`, `mfa.verify_failed`). Bypass does not silence audit.

## What it does NOT do

- Does not let unauthenticated users into sensitive routes — the unauth → `/auth/sign-in` redirect is unchanged.
- Does not affect role-based redirects (a `sales_rep` hitting `/platform` still bounces to `/dashboard`).
- Does not disable the enrollment flow — a user can still visit `/auth/mfa/setup` voluntarily.

## When to enable

| Environment | Default | Set to `true`? |
|---|---|---|
| Production | unset (= off) | **Never.** |
| Preview (`v3` deployments) | unset | Only for dedicated demo URLs. Document on the demo-org runbook. |
| Local dev | unset | OK if you don't want to enroll while iterating. |
| CI / automated test | unset | OK during e2e if the harness can't seed a TOTP secret. |

## How to enable / disable

**Vercel:**
1. Project → Settings → Environment Variables.
2. Set `MFA_DEMO_MODE = true` for the chosen environment scope (Preview / Production / Development).
3. Redeploy or trigger a new build — env vars are baked at build time for static routes; middleware reads at request time so a new deploy is the safest reset.

**Local:**
```sh
echo 'MFA_DEMO_MODE=true' >> .env.local
# or, one-off:
MFA_DEMO_MODE=true npm run dev
```

## How to verify it's off in production

After every Production deploy, confirm:

```sh
# Should redirect to /auth/mfa/setup or /auth/mfa
curl -I https://crm.builtrix.com/platform -L --max-redirs 0
# Expect: HTTP 307 → /auth/mfa/setup?return=%2Fplatform (when not enrolled)
#     OR  HTTP 307 → /auth/mfa?return=%2Fplatform (when stale)
```

If the response is `200 OK` from `/platform` directly without an MFA redirect, `MFA_DEMO_MODE=true` is set in Production — disable it immediately.

A runtime warning log is *not* emitted (yet — flagged by the D-300 Gate-4 security scan as a LOW finding; see V3.x backlog `docs/plans/v3-plan-v1.md` §7).

## Interaction with `demo_mode` platform flag

The v2 `demo_mode` platform_flag (in [platform_flags](../../supabase/migrations/20260509200000_platform_flags.sql)) historically gated the `<MfaFreshnessBanner>` advisory bar. **The banner is removed in D-300** — the platform_flag no longer affects the MFA redirect path. The flag remains defined for any future per-org demo affordance.

## Operator checklist before recording a demo

- [ ] Set `MFA_DEMO_MODE=true` on the demo's Preview env scope.
- [ ] Trigger a fresh deploy.
- [ ] Smoke: sign in as `super_admin`, navigate to `/platform`, confirm no `/auth/mfa*` redirect.
- [ ] Smoke: sign in as `org_admin`, navigate to `/admin/billing`, confirm direct render.
- [ ] After demo, **unset** `MFA_DEMO_MODE` on that env (or delete the demo deployment).

## Audit-trail expectations during demo

Every demo run still writes:
- `mfa.enrolled` if a demo user happens to enroll.
- `mfa.verified` if a demo user happens to re-verify (the bypass doesn't *prevent* verification; it just doesn't *force* it).

If the demo never touches MFA flow, no MFA audit rows are produced for that user — that's the intended demo flow.
