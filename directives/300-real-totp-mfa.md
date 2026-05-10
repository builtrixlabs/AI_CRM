# Directive 300 — Real TOTP MFA + recovery codes

**Kind:** feature (V3 / Phase A — auth & security hardening)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Generated:** 2026-05-10
**Branch target:** `v3` (cut from `v2` tip `d7b28d9`; rebased onto `main` post [apps#41](https://github.com/builtrixlabs/AI_CRM/pull/41))
**Source:** `docs/plans/v3-plan-v1.md` §3 D-300
**Builds on:** D-209 (MFA scaffolding), D-005 (auth flow), D-018 (users mgmt)
**Numbering note:** v3 series begins at 300 (intentional gap after v2's D-225) to delimit the phase.

---

## Problem

v2's D-209 ships MFA **scaffolding only** — `profiles.mfa_verified_at` column, an `isMfaFresh` helper, an advisory `<MfaFreshnessBanner>`, and a click-stub `/auth/mfa` page that just bumps the timestamp. There's no actual OTP delivery; the page is functionally a "click here to vouch you're you" button.

D-300 closes the gap with **real TOTP enrollment + verify + recovery codes**, swaps v2's advisory banner for a **hard redirect** on stale MFA for sensitive routes, and adds the encrypt-at-rest, hash-recovery-codes, single-use, and audit primitives an actual auth boundary needs. The `MFA_DEMO_MODE` env + `demo_mode` platform-flag bypass are preserved verbatim so v2's demo runbook keeps working.

## Success criteria (production target 80/90)

### Schema (additive)

- [ ] **AC-1** Migration `supabase/migrations/<ts>_profiles_mfa_secret.sql`:
  - `profiles.mfa_secret jsonb NULL` — encrypted TOTP secret payload `{iv, ciphertext, alg, key_version}` (AES-256-GCM, key from env). NEVER stores plaintext or a hash (TOTP requires the secret at verify time, so it must be reversibly encrypted, not hashed).
  - `profiles.mfa_recovery_codes jsonb NULL` — array of `{hash: string, used_at: timestamptz | null, used_from_ip: string | null}` (10 entries at enrollment).
  - `profiles.mfa_enrolled_at timestamptz NULL` (NULL = not enrolled).
  - RLS unchanged — `profiles` already tenant-scoped from D-001; no cross-org read of these columns possible.

### Crypto helpers

- [ ] **AC-2** New module `src/lib/auth/totp.ts`:
  - `generateSecret()` → `{ secret_b32: string, otpauth_url: string }` using the `otpauth` npm library.
  - `encryptSecret(plaintext_b32: string): MfaSecretPayload` / `decryptSecret(payload: MfaSecretPayload): string` using `crypto.createCipheriv('aes-256-gcm', ...)` with a per-call 12-byte IV; key sourced from `MFA_ENCRYPTION_KEY` env (32-byte hex). `key_version` field reserved for future rotation.
  - `verifyCode(secret_b32: string, code: string, now_ms?: number): boolean` — ±30s skew window (1 step), rejects beyond. Code format: 6 digits, leading-zero preserved.
  - All exports pure; no module-level singletons; client argument injection for testability per existing pattern (`injectable-supabase-client-for-tests`).

- [ ] **AC-3** New module `src/lib/auth/recovery-codes.ts`:
  - `generateCodes(n: number = 10): string[]` — alphanumeric, formatted `XXXX-XXXX`, character set excludes `0/O/I/1` for visual clarity, ≥40 bits of entropy per code.
  - `hashCode(code: string): Promise<string>` / `verifyCodeHash(code: string, hash: string): Promise<boolean>` — `bcryptjs` (existing dep — confirm at impl time; if absent, reuse Supabase's hashing pathway, never roll our own).
  - `markCodeUsed(client, user_id, code, ip): Promise<{ ok: boolean; reason?: 'invalid' | 'already_used' }>` — updates the jsonb array atomically; rejects if all codes already-used or no match.

### Routes

- [ ] **AC-4** New page `/auth/mfa/setup` (`src/app/auth/mfa/setup/page.tsx`):
  - **GET:** authenticated users without `mfa_enrolled_at` only (redirect elsewhere otherwise). Server generates secret, renders QR PNG via the `qrcode` npm library as a data URL, displays the 10 recovery codes ONCE with a one-time-show warning + "Download .txt" button.
  - **POST (server action):** accepts 6-digit verify code; on success, atomically: encrypt + store secret, hash + store recovery codes, set `mfa_enrolled_at = now()`, `mfa_verified_at = now()`, audit-log `mfa.enrolled`. Redirects to `?return=` or `/`.
  - On verify failure: renders inline error; uses existing rate-limit primitive (5 attempts / 15min / IP); after 5 failures, the secret is discarded and the user must restart enrollment (no resend of QR for the same secret).

- [ ] **AC-5** Refactored page `/auth/mfa` (`src/app/auth/mfa/page.tsx` — replaces v2 click-stub):
  - Two paths: "Authenticator code" (6 digits) and "Recovery code" (`XXXX-XXXX`).
  - Both: rate-limited 5/15min/IP via D-209's existing primitive (replaced by D-301's KV-backed limiter once shipped).
  - Code path: `verifyCode(decryptedSecret, input)` → on success bump `mfa_verified_at`, audit `mfa.verified`, redirect.
  - Recovery path: `markCodeUsed(...)` → on success bump `mfa_verified_at`, audit `mfa.recovery_code_used` (with `code_index`, not the code itself), redirect.
  - On failure: throttled audit `mfa.verify_failed` (1/min/user max).
  - Server action contract returns the discriminated-union shape per the existing `server-action-result-discriminated-union` pattern.

### Edge enforcement

- [ ] **AC-6** Update `src/lib/auth/route-policy.ts` (`decideRoute`):
  - For authenticated user + sensitive route (existing `isSensitiveRoute`):
    - If `MFA_DEMO_MODE` env OR `demo_mode` platform_flag is true → allow (preserve v2 demo path).
    - Else if `mfa_enrolled_at IS NULL` → redirect to `/auth/mfa/setup?return=<path>`.
    - Else if `!isMfaFresh(mfa_verified_at)` → redirect to `/auth/mfa?return=<path>`.
    - Else → allow.
  - This preserves the pure-function shape (existing `edge-middleware-as-routing-policy` pattern).
  - Banner removal: drop `<MfaFreshnessBanner>` from the three pages it was injected at in D-209 (`/admin/billing`, `/settings/users`, `/settings/roles`); the hard redirect supersedes it.

### Configuration

- [ ] **AC-7** New env var `MFA_ENCRYPTION_KEY` (64-hex chars = 32 bytes):
  - Documented in `.env.example` with generator hint (`openssl rand -hex 32`).
  - Required in production (env validation throws at boot if missing); optional in test/dev (helpers fall back to a deterministic test key when `NODE_ENV !== 'production'`).
  - Set on Vercel Production + Preview (v3) — operator action in runbook.

- [ ] **AC-8** Demo bypass preserved verbatim from D-209 (`MFA_DEMO_MODE` env + `demo_mode` platform_flag). Bypass short-circuits BOTH the hard redirect (AC-6) AND the setup gate (a demo user is allowed to skip enrollment entirely).

### Audit + observability

- [ ] **AC-9** Audit log entries for every state transition:
  - `mfa.enrolled` — on successful setup (carries no secret/codes).
  - `mfa.verified` — on each successful re-verify (carries `method: 'totp' | 'recovery_code'`).
  - `mfa.recovery_code_used` — on recovery code use (carries `code_index: 0..9`, NEVER the plaintext code).
  - `mfa.verify_failed` — on failed attempt (throttled 1/min/user; carries `method`).
  - `mfa.disabled` — reserved for V3.x (lost-device flow); not implemented in this directive.

### Tests (TDD — RED first)

- [ ] **AC-10** `tests/lib/auth/totp.test.ts`:
  - Encrypt/decrypt roundtrip preserves the original secret bytes.
  - `verifyCode` accepts current TOTP step.
  - `verifyCode` accepts ±1 step (the ±30s skew window).
  - `verifyCode` rejects ±2 steps (beyond skew).
  - Malformed code shapes (not 6 digits, contains letters) reject without throwing.
  - Decryption with wrong key returns null/throws (not silent corruption).

- [ ] **AC-11** `tests/lib/auth/recovery-codes.test.ts`:
  - `generateCodes(10)` returns 10 unique well-formed codes.
  - `hashCode`/`verifyCodeHash` roundtrip.
  - `markCodeUsed` succeeds once, rejects identical second use with `reason: 'already_used'`.
  - `markCodeUsed` with non-matching code returns `reason: 'invalid'`.

- [ ] **AC-12** `tests/lib/auth/route-policy.test.ts` (extends existing 27-case suite):
  - Sensitive route + authenticated + stale `mfa_verified_at` → redirect to `/auth/mfa?return=...`.
  - Sensitive route + authenticated + `mfa_enrolled_at IS NULL` → redirect to `/auth/mfa/setup?return=...`.
  - Sensitive route + authenticated + fresh MFA → allow.
  - Sensitive route + `MFA_DEMO_MODE=true` → allow regardless of stamp.
  - Sensitive route + `demo_mode` platform flag → allow regardless of stamp.
  - Non-sensitive route + stale MFA → allow (no redirect on harmless surfaces).

- [ ] **AC-13** `tests/integration/mfa-flow.test.ts`:
  - Full flow: enroll → first verify → access `/admin/billing` → wait past freshness → blocked at `/admin/billing` (302 to `/auth/mfa?return=/admin/billing`) → re-verify with code → access allowed.
  - Recovery path: same flow with `markCodeUsed` consuming a code; re-attempt with same code → 401-shape result.
  - Cross-org isolation: user A's codes/secrets cannot be read by user B (RLS smoke).

- [ ] **AC-14** Coverage on touched files: ≥80% lines / ≥90% branches. Coverage exclusion `// v5:coverage-ignore <reason>` capped at 5% per file.

- [ ] **AC-15** Gate-4 security scan: 0 CRITICAL after auto-fix loop (max 3 attempts). HIGH/MED logged + parallel-fixed.

## Non-goals (deferred to V3.x or later)

- **WebAuthn / passkeys** — TOTP is the MVP industry-standard second factor. Passkeys land V3.x.
- **Hardware tokens (Yubikey, FIDO2 keys)** — V3.x.
- **SMS-based OTP** — explicitly OUT. NIST 800-63B deprecated SMS for high-assurance contexts; cost + spoofing risk also disfavor it.
- **Trusted-device "remember me 30 days" cookie** — every device re-verifies per freshness window. Trusted-device cookie is V3.x once we have a clear UX spec for revocation.
- **Org-admin-driven MFA disable for individual users** — lost-device unblock is **platform-admin only** for v3 MVP (audit-logged at `/platform/users/[id]/mfa-reset`). Org-admin self-serve resets are V3.x.
- **Per-org `force_mfa` toggle UI** — D-207's `force_mfa` platform flag is honored at edge (already in v2); D-300 doesn't add a UI to flip it per-org. Platform-wide flag only.
- **MFA secret rotation** — `key_version` field is reserved in the jsonb payload but rotation tooling lands V3.x.
- **Session invalidation on enrollment** — enrollment doesn't kill other live sessions for the same user. Force-sign-out lives in D-302.

## Stack

- **Existing:** Next.js 14 App Router, Supabase (auth + DB + RLS), shadcn/ui, Vercel.
- **New runtime libraries:**
  - `otpauth` (~13KB, zero deps) — TOTP/HOTP impl + `otpauth://` URL builder.
  - `qrcode` (~50KB) — server-side PNG-as-data-URL renderer.
- **Existing utility — confirm at impl time:** `bcryptjs` for recovery code hashing. If absent, evaluate `argon2` (stronger but native dep, may need Vercel runtime check). Never roll our own.
- **No new dep for AES-GCM:** Node built-in `crypto`.
- **Tests:** Vitest + RTL setup (`tests/setup-rtl.ts` already polyfills `ResizeObserver` + `scrollIntoView` per `jsdom-polyfill-resizeobserver-and-scrollintoview` pattern).

## Learned patterns applied

Per skill rule, only patterns at confidence ≥3 are auto-included. Current `memory/learned/ai-crm/patterns.md` has none at that threshold yet. The following confidence-2 patterns are load-bearing for D-300 and the implementation will reuse them verbatim:

- **`edge-middleware-as-routing-policy`** (confidence 1) — `decideRoute` stays a pure function; the MFA gate slots into the existing decision tree.
- **`belt-and-suspenders-platform-only`** (confidence 1) — MFA gate enforced in middleware (load-bearing) AND in server actions (defense-in-depth) for sensitive mutations like role overrides.
- **`server-action-result-discriminated-union`** (confidence 1) — `/auth/mfa/setup` and `/auth/mfa` POST actions return `{ ok, error?, fieldErrors? }` shape, no thrown exceptions across the RSC boundary.
- **`injectable-supabase-client-for-tests`** (confidence 1) — `verifyCode` / `markCodeUsed` accept optional `client?` for test injection.
- **`append-only-via-trigger`** (confidence 2) — audit_log is append-only by trigger; D-300 audit rows go through the existing helper, no new write path.
- **`caller-org-filter-on-service-role-mutation`** (confidence 2) — any service-role write to `profiles.mfa_*` columns must verify the target row's `organization_id` matches the caller's claim before mutating.
- **`provenance-as-not-null-columns`** (confidence 1) — every write sets `created_by/_via` (`'system'` for migration backfill, the user_id/`'web'` at runtime).

## Authority

- Constitution V — **Bounded Authority** (auth boundary is non-negotiable; agents and humans both gate through it).
- POLICY 003 (Prompt Discipline), POLICY 010 (Continuous Learning) — directive-from-prompt skill contract.
- Supersedes: D-209 § AC-7 ("No hard redirect for v2") — D-300 lands the hard redirect.

## Operator follow-ups (not part of TDD execution)

- [ ] Generate prod `MFA_ENCRYPTION_KEY` via `openssl rand -hex 32`; store in 1Password / vault.
- [ ] Set `MFA_ENCRYPTION_KEY` on Vercel Production + Preview (v3).
- [ ] Confirm enrollment flow on staging with a real authenticator app (Authy / 1Password / Aegis) before tagging v3.0.
- [ ] Update [docs/runbooks/demo-mode.md](../docs/runbooks/demo-mode.md) (new — to be written) with the `MFA_DEMO_MODE` toggle behavior under D-300's hard-redirect path.
