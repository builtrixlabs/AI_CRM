# Plan — 300-real-totp-mfa

1. Migration `supabase/migrations/<ts>_profiles_mfa_secret.sql` — additive, no RLS change.
2. Install runtime deps: `otpauth`, `qrcode`, `bcryptjs`. Install dev: `@types/qrcode`, `@types/bcryptjs`.
3. `src/lib/auth/totp.ts` — `generateSecret()`, `encryptSecret()`, `decryptSecret()`, `verifyCode()`. RED test first per TDD.
4. `src/lib/auth/recovery-codes.ts` — `generateCodes()`, `hashCode()`, `verifyCodeHash()`, `markCodeUsed()`. RED test first.
5. `src/lib/auth/route-policy.ts` — extend `decideRoute` for hard MFA redirect; keep demo bypass. Extend existing test suite (currently 27 cases) with 6 new cases.
6. `src/app/auth/mfa/setup/page.tsx` (server component) + server action.
7. `src/app/auth/mfa/page.tsx` — refactor click-stub to two-path verify (TOTP code + recovery code).
8. Drop `<MfaFreshnessBanner>` from `/admin/billing`, `/settings/users`, `/settings/roles`.
9. `.env.example` add `MFA_ENCRYPTION_KEY`. Env validation throws at boot in production if missing.
10. Audit log: 4 new event kinds wired through existing audit helper.
11. Integration test: full enroll → verify → access → stale → re-verify cycle.
12. `npm test` + coverage check (80/90); generate fillers if short. Then `npm run build` + Gate 4 security scan.
13. Commit per task; push to `claude/vibrant-kirch-335123` (current PR #42 — "v3 init: plan + D-300").
