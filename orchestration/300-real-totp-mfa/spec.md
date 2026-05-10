# Spec — 300-real-totp-mfa

Replace v2's D-209 click-stub at `/auth/mfa` with real TOTP MFA + 10 single-use recovery codes. Hard-redirect on stale MFA for sensitive routes; preserve `MFA_DEMO_MODE` bypass.

Source of truth: `directives/300-real-totp-mfa.md` (15 ACs, production-grade 80/90 coverage).

Deliverables:

1. Migration: `profiles.mfa_secret jsonb`, `profiles.mfa_recovery_codes jsonb`, `profiles.mfa_enrolled_at timestamptz` (additive, RLS unchanged).
2. Crypto: `src/lib/auth/totp.ts` (AES-256-GCM encrypt/decrypt + TOTP verify ±30s).
3. Crypto: `src/lib/auth/recovery-codes.ts` (bcryptjs hash + single-use mark).
4. Routes: `/auth/mfa/setup` (new), `/auth/mfa` (refactor v2 click-stub).
5. Edge: `src/lib/auth/route-policy.ts` hard redirect on stale MFA.
6. Cleanup: drop `<MfaFreshnessBanner>` from 3 v2 pages.
7. Env: `MFA_ENCRYPTION_KEY` documented + boot-validated in production.
8. Audit: 4 new audit_log kinds (`mfa.enrolled`, `mfa.verified`, `mfa.recovery_code_used`, `mfa.verify_failed`).

New deps: `otpauth`, `qrcode`, `bcryptjs` (+ `@types/qrcode`, `@types/bcryptjs`).
