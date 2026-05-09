# Tasks — 300-real-totp-mfa

Slice 1 (foundation — this turn):
- [ ] T1 install deps (`otpauth`, `qrcode`, `bcryptjs`, `@types/*`)
- [ ] T2 migration — `profiles.mfa_secret/_recovery_codes/_enrolled_at`
- [ ] T3 RED+GREEN+REFACTOR — `src/lib/auth/totp.ts`
- [ ] T4 RED+GREEN+REFACTOR — `src/lib/auth/recovery-codes.ts`

Slice 2 (edge + routes — next turn):
- [ ] T5 RED+GREEN — `src/lib/auth/route-policy.ts` hard MFA redirect
- [ ] T6 `src/app/auth/mfa/setup/page.tsx` + server action
- [ ] T7 refactor `src/app/auth/mfa/page.tsx` (TOTP + recovery paths)

Slice 3 (cleanup + verify — final turn):
- [ ] T8 drop `<MfaFreshnessBanner>` from 3 sensitive pages
- [ ] T9 env wiring (`.env.example` + boot validation)
- [ ] T10 audit log integration tests
- [ ] T11 e2e integration test (enroll → verify → access → stale → recover)
- [ ] T12 coverage 80/90 + Gate 4 security scan + push
