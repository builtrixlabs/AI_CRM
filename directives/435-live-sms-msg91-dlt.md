# Directive 435 — Live MSG91 SMS + DLT templates + per-org configuration

**Status:** Authored
**Date:** 2026-05-13
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/435-live-msg91-sms-dlt` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 1.3](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)

## 1. Problem

D-418 shipped the SMS adapter shell (templated-only, DLT registry enforcement built into the contract). D-501/D-433/D-434/D-439 lit the rails for per-org provider config. **D-435 lights MSG91 with per-org DLT template management.**

India's TRAI rules require every business SMS to use a DLT-registered template. Each org runs its own DLT registration (separate principal entity per business). The product must (a) hold each org's MSG91 credentials independently and (b) hold each org's registered DLT templates independently — there's no shared template registry.

## 2. Scope (in)

1. **Migration** `supabase/migrations/20260513130000_org_sms_config_and_dlt.sql`
   - Table `org_sms_config` (org_id PK, provider CHECK ∈ {msg91, gupshup}, encrypted_credentials JSONB, sender_id, dlt_entity_id, is_active, test_ping_*, provenance).
   - Table `dlt_templates` (organization_id + template_id PK, content text, category text ∈ {promotional, transactional, service}, registered_at, provenance) RLS org-scoped.
   - Redacted view `org_sms_config_redacted` masking ciphertext.
2. **Verify script** `scripts/verify_d435.mjs` (mirror `verify_d433.mjs`, +DLT table checks).
3. **MSG91 adapter** `src/lib/comms/sms/providers/msg91.ts` — implements `SmsAdapter.send` against MSG91 v5 Flow API. Requires the template_id to be present in `dlt_templates` for the calling org; rejects custom (non-templated) sends with `template_not_found`. Plus `msg91TestPing` against the balance endpoint.
4. **Per-org instantiation** `src/lib/comms/sms/org-config.ts` — `instantiateSmsAdapter(row, allowedTemplates)` decrypts + constructs MSG91 with the allowed-template set.
5. **Health wiring** `src/lib/integrations/health.ts` — `buildSmsHealth(row)`; the index now reads `org_sms_config_redacted` and slots SMS into the channel grid.
6. **Admin UI** `src/app/(admin)/admin/integrations/sms/page.tsx` + `form.tsx` + `dlt-templates.tsx` + `actions.ts` — credential card (provider + authkey + sender_id + dlt_entity_id) + DLT template list with add / remove server actions.
7. **Tests**
   - `tests/lib/comms/sms/msg91.test.ts` — constructor validation, send happy path, template-not-in-registry rejection, non-2xx HTTP, missing request_id, balance test-ping branches.
   - `tests/lib/comms/sms/org-config.test.ts` — instantiation, not_configured, provider_unsupported (gupshup).
   - `tests/lib/integrations/health.test.ts` — SMS branches (mirrors email).

## 3. Out of scope

- Gupshup SMS — separate D-435.x once we're sure of pricing on the pilot org. Adapter pattern already supports it.
- SMS delivery-receipt webhook — MSG91 supports it via Vercel-friendly POST callbacks; activity-stream wiring deferred to the dispatcher directive.
- Bulk import of DLT templates from MSG91 dashboard — operator pastes one at a time for now.

## 4. Per-org integration model — locked

Operator never provides MSG91 credentials or DLT templates. Each org_admin pastes their own authkey + sender_id + dlt_entity_id in `/admin/integrations/sms` and adds the DLT templates their org has registered with TRAI. Credentials encrypted with `INTEGRATION_ENCRYPTION_KEY` (D-501).

## 5. Operator setup before live sending

1. Sign up for MSG91 (per organization). Complete DLT principal-entity registration.
2. Generate an authkey (Profile → Auth keys).
3. Identify sender_id (header) + dlt_entity_id (principal entity id).
4. Register SMS templates with TRAI via DLT portal; copy each template_id + content into `/admin/integrations/sms` → DLT Templates.
5. `/admin/integrations/sms` → paste authkey + sender_id + dlt_entity_id → Save → Test ping (verifies authkey against the balance endpoint).
6. Follow-up agent dispatch lights up automatically once the dispatcher directive lands.

## 6. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** all files in §2.
2. **Tested:** new vitest green.
3. **Typechecked:** clean for changed files.
4. **Migrations:** `20260513130000_org_sms_config_and_dlt.sql` applied + `verify_d435.mjs` 11/11 PASS.
5. **Pushed:** PR opened against v5.
6. **Vercel preview green.**
7. **UI verified on live preview.**
8. **PR merged to v5.**
9. **Post-merge v5 build green.**
10. **Status logged in V5_STATUS.md.**
