# Directive 432 — WhatsApp providers (Gupshup + Meta Cloud API direct) + per-org configuration

**Status:** Authored
**Date:** 2026-05-13
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/432-whatsapp-providers` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 1.4](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)

## 1. Problem

D-010 (V0) shipped `org_whatsapp_endpoints` for inbound HMAC verification only. D-435 just landed the SMS+DLT pattern. **D-432 lights WhatsApp outbound + inbound for two providers in one directive:**

- **Gupshup** — BSP-style API, lower setup pain, costlier per message. Good for low/medium volume orgs.
- **Meta Cloud API direct** — owned WhatsApp Business account, lowest per-message cost, more setup. Good for >50K msg/mo.

Each org picks one. The product never holds shared/global WhatsApp credentials.

## 2. Scope (in)

1. **Migration** `supabase/migrations/20260513140000_org_whatsapp_endpoints_extend.sql`
   - EXTEND existing `org_whatsapp_endpoints` (D-010) with: `provider text CHECK ∈ {gupshup, cloud_api}` (nullable for V0 backward compat), `encrypted_credentials jsonb`, `approved_template_ids text[]` (default `'{}'`), `from_phone_number_id text` (Cloud API only), `from_display_number text`, `test_ping_at/ok/message`.
   - Create `org_whatsapp_endpoints_redacted` view masking ciphertext + secret_sha256, surfacing `is_configured`, `is_active`, provider, from_*, approved-templates count.
2. **Verify script** `scripts/verify_d432.mjs` — checks new columns + redacted view.
3. **WhatsApp comms module** (new — D-418 never shipped a WhatsApp shell):
   - `src/lib/comms/whatsapp/types.ts` — WhatsAppAdapter, `WhatsAppSendArgs` (templated only — WhatsApp Business API requires pre-approved templates for unsolicited sends).
   - `src/lib/comms/whatsapp/registry.ts` — factory registry.
   - `src/lib/comms/whatsapp/providers/mock.ts` — DLT-style template registry enforcement.
   - `src/lib/comms/whatsapp/providers/gupshup.ts` — Gupshup BSP API (HTTP form-encoded, `apikey` header).
   - `src/lib/comms/whatsapp/providers/cloud-api.ts` — Meta Graph API `/v17.0/{phone-number-id}/messages` (Bearer auth).
   - `src/lib/comms/whatsapp/org-config.ts` — per-org instantiation with allowed-template set.
   - `src/lib/comms/whatsapp/index.ts` — re-exports + self-registers mock.
4. **Health wiring** `src/lib/integrations/health.ts` — `buildWhatsAppHealth(row)`; index reads `org_whatsapp_endpoints_redacted`.
5. **Admin UI** `src/app/(admin)/admin/integrations/whatsapp/page.tsx` + `form.tsx` + `approved-templates.tsx` + `actions.ts` — provider picker (gupshup / cloud_api) → cred form (api_key / access_token / phone_number_id / display_number) → approved-template-IDs registry.
6. **Tests**
   - `tests/lib/comms/whatsapp/gupshup.test.ts` — constructor + send happy + template registry rejection + non-2xx + test-ping branches.
   - `tests/lib/comms/whatsapp/cloud-api.test.ts` — same shape.
   - `tests/lib/comms/whatsapp/org-config.test.ts` — instantiation per provider.
   - `tests/lib/integrations/health.test.ts` — WhatsApp branches.

## 3. Out of scope

- Inbound WhatsApp webhook (D-010 already routes inbound HMAC; signature-verification swap for Cloud API lives in a follow-up).
- Approval-queue follow-up agent wiring (D-322 dispatcher rolls in later).
- Bulk import of approved templates from Meta Business Manager / Gupshup dashboard.

## 4. Per-org integration model — locked

Operator never provides WhatsApp credentials or templates. Each org_admin picks Gupshup or Cloud API, pastes their org's creds, registers their org's pre-approved template IDs, and chooses a from-number. Credentials encrypted with `INTEGRATION_ENCRYPTION_KEY` (D-501).

## 5. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** all files in §2.
2. **Tested:** new vitest green.
3. **Typechecked:** clean for changed files.
4. **Migrations:** `20260513140000_org_whatsapp_endpoints_extend.sql` applied + `verify_d432.mjs` 9/9 PASS.
5. **Pushed:** PR opened against v5.
6. **Vercel preview green.**
7. **UI verified on live preview.**
8. **PR merged to v5.**
9. **Post-merge v5 build green.**
10. **Status logged in V5_STATUS.md.**
