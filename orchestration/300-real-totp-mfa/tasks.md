# Tasks — 300-real-totp-mfa

Slice 1 (foundation):
- [x] T1 install deps (`otpauth`, `qrcode`, `bcryptjs`, `@types/*`)
- [x] T2 migration — `profiles.mfa_secret/_recovery_codes/_enrolled_at`
- [x] T3 RED+GREEN+REFACTOR — `src/lib/auth/totp.ts` (15 tests, 100% coverage)
- [x] T4 RED+GREEN+REFACTOR — `src/lib/auth/recovery-codes.ts` (16 tests, 100% coverage)

Slice 2 (edge + routes):
- [x] T5 `src/lib/auth/route-policy.ts` hard MFA redirect (+13 gate tests)
- [x] T6 `src/app/auth/mfa/setup/page.tsx` + server action
- [x] T7 refactor `src/app/auth/mfa/page.tsx` (TOTP + recovery paths)

Slice 3 (cleanup + verify):
- [x] T8 drop `<MfaFreshnessBanner>` from 3 sensitive pages + delete component
- [x] T9 `MFA_ENCRYPTION_KEY` in `.env.example`; production fail-fast in `getKey()`
- [x] T10 rate-limit on /auth/mfa* (5/15min/IP via mfaVerifyBucket)
- [x] T11 mocked-DB integration test (8 cases — enroll, verify, recovery, rate-limit)
- [x] T12 Gate 4 — npm build green, vitest 991/991, security scan: warnings (no CRITICAL/HIGH)
- [x] T13 runbooks — docs/runbooks/{demo-mode.md, v3-mfa-deploy.md}

Operator follow-ups (post-merge):
- [ ] Generate prod `MFA_ENCRYPTION_KEY` via `openssl rand -hex 32`; set on Vercel Production + Preview (v3)
- [ ] Apply migration `20260510120000_profiles_mfa_secret.sql` to AI CRM Supabase prod
- [ ] Smoke test enrollment + verify + recovery per `docs/runbooks/v3-mfa-deploy.md` §4
- [ ] Tag v3.0 on the v3 branch tip after green slice-3 acceptance
