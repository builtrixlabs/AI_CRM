# Directive 209 — MFA freshness on sensitive routes

**Kind:** feature (V2 / Phase B — security)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-209

---

## Problem

PSCRM gates sensitive admin routes behind a freshness-checked MFA stamp. Builtrix doesn't. Customers reasonably expect that touching `/platform/*`, billing, integrations, or role management requires recent re-auth.

D-209 ships the **scaffolding**: column on profiles, helper library, banner component, stub `/auth/mfa` verify page, and a `MFA_DEMO_MODE` env bypass so demos keep running. **Real OTP / TOTP delivery lands V3** — for v2 the verify page just bumps the stamp on click.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Additive migration: `profiles.mfa_verified_at timestamptz NULL`. Backfill: NULL = "never verified".
- [ ] **AC-2** Library `src/lib/auth/mfa.ts`:
  - `MFA_FRESHNESS_HOURS = 8` (override via env `MFA_FRESHNESS_HOURS`).
  - `isMfaFresh(verified_at: string | null, now=Date.now())` returns boolean.
  - `isSensitiveRoute(pathname)` → matches `/platform/*`, `/admin/billing`, `/admin/integrations/*`, `/settings/users`, `/settings/roles`, `/admin/webhooks`.
  - `isDemoBypassActive()` → true if `MFA_DEMO_MODE=true` env OR `demo_mode=true` platform_flag.
  - `markMfaVerified(user_id)` — bumps timestamp via service-role client.
- [ ] **AC-3** Component `<MfaFreshnessBanner verified_at={...} />`: renders an amber bar atop sensitive pages when stale. Hidden under demo bypass.
- [ ] **AC-4** Stub page `/auth/mfa/page.tsx`: shows "Re-verify MFA" + a button that bumps the stamp. Real OTP delivery is V3.
- [ ] **AC-5** Server action `confirmMfaAction(returnTo: string)` — bumps the caller's timestamp + redirects.
- [ ] **AC-6** Wire the banner into at least three sensitive pages: `/admin/billing`, `/settings/users`, `/settings/roles`.
- [ ] **AC-7** No hard redirect for v2 (just the advisory banner). Hard redirect lands V3 once OTP delivery is wired.

## Tests

- [ ] **AC-8** Unit tests for `isMfaFresh` (null = stale; within window = fresh; outside = stale).
- [ ] **AC-9** Unit tests for `isSensitiveRoute` (matches expected patterns).
- [ ] **AC-10** Unit tests for `isDemoBypassActive` (env + flag interplay).
- [ ] **AC-11** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Stack

Postgres ALTER + Supabase service-role for the timestamp bump + shadcn alert.
