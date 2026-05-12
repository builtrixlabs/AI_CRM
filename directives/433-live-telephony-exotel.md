# Directive 433 — Live Exotel telephony + per-org configuration

**Status:** Authored
**Date:** 2026-05-12
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/433-live-telephony-exotel` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 1.1](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md#1-1--d-433-live-exotel-telephony--per-org-config)
**Memory:** [per_org_integration_model](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md)

## 1. Problem

D-418 (v4) shipped the telephony adapter shell — interface + mock provider + registry. D-501 (v5) shipped the encryption helpers, `/admin/integrations` index, and per-org admin pattern. **D-433 lights the first live provider: Exotel.**

Each organization that signs up plugs in its **own** Exotel credentials inside the application. The product never holds a shared / global Exotel account. The provider adapter framework picks the right adapter per-org per dial via an `org_telephony_config` row lookup.

## 2. Scope (in)

1. **Migration** `supabase/migrations/20260512120000_org_telephony_config.sql`
   - Table `org_telephony_config` (organization_id PK, provider CHECK, encrypted_credentials JSONB, virtual_number, is_active, test_ping_at/ok/message, provenance).
   - RLS: own-org SELECT for authenticated; INSERT/UPDATE/DELETE denied (server actions via service role only).
   - Redacted view `org_telephony_config_redacted` for client reads — never round-trips the encrypted blob.
2. **Verify script** `scripts/verify_d433.mjs` — checks table / PK / CHECK / RLS / policies / view / grants.
3. **Exotel adapter** `src/lib/comms/telephony/providers/exotel.ts` — implements `TelephonyAdapter` (outboundClickToCall, lookupCallStatus, subscribe handlers), plus `exotelTestPing` helper for credential verification against `GET /v1/Accounts/{sid}.json`.
4. **Per-org instantiation** `src/lib/comms/telephony/org-config.ts` — `instantiateTelephonyAdapter(row)` decrypts credentials and constructs the right adapter; throws `CommsError('not_configured')` when `is_active=false`.
5. **Index export** `src/lib/comms/telephony/index.ts` — re-exports the Exotel provider + `instantiateTelephonyAdapter`. Self-registers the mock; Exotel is constructed per-org (no factory in the registry because the registry has no place to inject credentials).
6. **Admin UI** `src/app/(admin)/admin/integrations/telephony/page.tsx` — RSC reading the redacted view, rendering provider/status/last-ping summary + `TelephonyForm`. Warns when `INTEGRATION_ENCRYPTION_KEY` is unset.
7. **Client form** `src/app/(admin)/admin/integrations/telephony/form.tsx` — provider select + cred inputs + Save / Test ping / Deactivate actions.
8. **Server actions** `src/app/(admin)/admin/integrations/telephony/actions.ts` — `saveTelephonyConfig` / `testTelephonyPing` / `deactivateTelephony`. Uses `getSupabaseAdmin()` for INSERT/UPDATE (RLS denies authenticated writes by design). Encrypts with D-501's `encryptJson` before writing.
9. **Webhook** `src/app/api/webhooks/telephony/exotel/call-status/route.ts` — receives Exotel's call-status callbacks. Identifies the org via `?org=<uuid>` query param; verifies HTTP-basic auth header against the org's stored `api_key:api_token` (constant-time). Scaffolding only — full activity-stream wiring follows in a separate directive.
10. **Tests**
    - `tests/lib/comms/telephony/exotel.test.ts` — adapter outbound/lookup with mocked `fetch`; test-ping with 200 / 401 / 404 / network-error branches; constructor validation; mapping of Exotel statuses to our `CallStatus` union.
    - `tests/lib/comms/telephony/org-config.test.ts` — `instantiateTelephonyAdapter` decryption + provider routing + `not_configured` + `provider_unsupported` errors.
    - `tests/app/api/webhooks/telephony/exotel-call-status.test.ts` — webhook accepts authenticated POST with correct credentials, returns 401 on mismatched basic auth, returns 404 when org has no telephony config, returns 400 when `?org` missing.

## 3. Out of scope

- Wiring outbound clicks from lead canvases (D-007) to the per-org adapter — separate dispatcher directive.
- Inbound call routing into the activity stream / node_signals — separate directive once Exotel inbound webhook payload shape is locked.
- Servetel / Knowlarity / MyOperator / Ozonetel live providers — same per-org pattern, follow-up directives.
- Org-level webhook secret generation (today we verify HTTP basic against `api_key:api_token` which Exotel embeds in StatusCallback URLs).

## 4. Per-org integration model — locked

Operator never provides Exotel credentials. Each org_admin pastes their **own** Account SID + API key + API token + virtual number into `/admin/integrations/telephony`. Credentials are AES-256-GCM encrypted via `INTEGRATION_ENCRYPTION_KEY` (D-501) before INSERT. The decryption + dial path is per-request, scoped to the calling user's `org_id` resolved by RLS.

## 5. Operator setup before live dialing

1. Sign up for an Exotel account (per organization, not centrally).
2. From Exotel dashboard, copy Account SID, API key, API token, and a provisioned virtual number.
3. Open `/admin/integrations/telephony`, paste the four values, click Save.
4. Click Test ping — verifies the credentials against Exotel's account-info endpoint.
5. Configure Exotel's StatusCallback URL to `https://<api_key>:<api_token>@<host>/api/webhooks/telephony/exotel/call-status?org=<organization_id>` so call-status events route back to this org.
6. Click-to-call from lead canvases lights up automatically once the dispatcher directive (follow-up) lands.

## 6. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** all files in §2 exist.
2. **Tested:** new vitest files green; pre-existing suite unaffected.
3. **Typechecked:** `npx tsc --noEmit` clean for changed files.
4. **Migrations:** `20260512120000_org_telephony_config.sql` applied to live Supabase via `scripts/apply_migration.mjs`; `scripts/verify_d433.mjs` reports `8/8 checks pass`.
5. **Pushed:** `feature/433-live-telephony-exotel` pushed to origin; PR opened against `v5`.
6. **Vercel preview green:** preview READY; `/admin/integrations/telephony` renders (no 500).
7. **UI verified on live preview:** sign-in renders; admin form renders for an authenticated session (operator self-verifies — auth-gated).
8. **PR merged to v5** (squash + delete-branch).
9. **Post-merge v5 build green.**
10. **Status logged:** `docs/V5_STATUS.md` D-433 row `planned → shipped`.
