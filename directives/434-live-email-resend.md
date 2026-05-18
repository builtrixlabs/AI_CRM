# Directive 434 — Live Resend email + per-org configuration

**Status:** Authored
**Date:** 2026-05-13
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/434-live-resend-email` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 1.2](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)
**Memory:** [per_org_integration_model](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md)

## 1. Problem

D-418 (v4) shipped the email adapter shell. D-501 + D-433 + D-439 lit the encryption + admin pattern + health framework. **D-434 lights Resend as the first live email provider.**

Each organization plugs in its **own** Resend API key + verified sender. The product never holds a shared Resend account.

## 2. Scope (in)

1. **Migration** `supabase/migrations/20260513120000_org_email_config.sql`
   - Table `org_email_config` (organization_id PK, provider CHECK ∈ {resend, postmark}, encrypted_credentials JSONB, from_email, from_name, verified_at, is_active, test_ping_at/ok/message, provenance).
   - RLS: own-org SELECT for authenticated; INSERT/UPDATE/DELETE denied.
   - Redacted view `org_email_config_redacted` masking the ciphertext.
2. **Verify script** `scripts/verify_d434.mjs` (mirror `verify_d433.mjs`).
3. **Resend adapter** `src/lib/comms/email/providers/resend.ts` — implements `EmailAdapter.send` for `kind: "custom"` (Resend's templated mode lands in a follow-up). HTTP Bearer auth. Plus `resendTestPing` against `GET /domains`.
4. **Per-org instantiation** `src/lib/comms/email/org-config.ts` — `instantiateEmailAdapter(row)` decrypts and constructs Resend (mock supported for tests; postmark `provider_unsupported` until its directive ships).
5. **Index export** `src/lib/comms/email/index.ts` — re-exports Resend + `instantiateEmailAdapter`. Self-registers mock.
6. **Health wiring** `src/lib/integrations/health.ts` — `buildEmailHealth(row)` mirrors telephony's truth table; index reads `org_email_config_redacted` and slots email into the channel grid (D-439's unavailable placeholder retired).
7. **Admin UI** `src/app/(admin)/admin/integrations/email/page.tsx` + `form.tsx` + `actions.ts` — RSC + client form for Save / Test ping / Deactivate. Form takes provider + API key + from_email + from_name.
8. **Webhook** `src/app/api/webhooks/email/resend/route.ts` — Resend delivery-receipt callback. Body-only event capture for the scaffolding tier (no upstream activity-stream wiring yet); accepts JSON envelope, logs `{ type, email_id, to }`, returns 200. Full svix-HMAC verification lands with the dispatcher directive.
9. **Tests**
   - `tests/lib/comms/email/resend.test.ts` — adapter `send` (custom happy path / templated rejected / missing fields / non-2xx / missing id) + `resendTestPing` (200/401/403/network).
   - `tests/lib/comms/email/org-config.test.ts` — `instantiateEmailAdapter` decryption + provider routing + `not_configured` + `provider_unsupported`.
   - `tests/app/api/webhooks/email/resend.test.ts` — webhook accepts a valid Resend event envelope and returns 200; rejects empty body with 400.
   - `tests/lib/integrations/health.test.ts` — add buildEmailHealth branches.

## 3. Out of scope

- Templated mode (Resend's "broadcast" / template API) — D-434 ships `kind: "custom"` only.
- Outbound dispatcher wiring follow-up agents (D-415) to the per-org Resend adapter.
- svix-HMAC webhook signature verification — scaffolding only.
- Postmark provider — future D-434.x.

## 4. Per-org integration model — locked

Operator never provides a Resend API key. Each org_admin pastes their own API key + verified-domain `from_email` + `from_name` into `/admin/integrations/email`. Credentials encrypted with `INTEGRATION_ENCRYPTION_KEY` (D-501) before INSERT.

## 5. Operator setup before live sending

1. Sign up for Resend (per organization).
2. Verify a sending domain in Resend; copy the verified `from_email`.
3. Generate a server-side API key in Resend → Settings → API Keys.
4. `/admin/integrations/email` → paste → Save → Test ping (verifies API key against `GET /domains`).
5. Follow-up agent dispatch lights up automatically once the dispatcher directive lands.

## 6. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** all files in §2 exist.
2. **Tested:** new vitest green.
3. **Typechecked:** `tsc --noEmit` clean for changed files.
4. **Migrations:** `20260513120000_org_email_config.sql` applied to live Supabase via `scripts/apply_migration.mjs`; `scripts/verify_d434.mjs` 8/8 PASS.
5. **Pushed:** `feature/434-live-resend-email` to origin; PR opened.
6. **Vercel preview green.**
7. **UI verified on live preview:** sign-in renders; `/admin/integrations/email` renders for an authenticated session (operator self-verifies).
8. **PR merged to v5** (squash + delete-branch).
9. **Post-merge v5 build green.**
10. **Status logged:** `docs/V5_STATUS.md` D-434 row `planned → shipped`.
