# V5 Status — implementation tracker

**Date:** 2026-05-12
**Branch:** `v5` (cut from `v4@62ad076` on 2026-05-12)
**Scope:** AI_CRM-4 order of implementation v2 — 9 directives from pre-sales-only scope to `v1.0` GA.
**Source of truth:** [`C:\Users\ragha\Downloads\AI_CRM-4-order-of-implementation-v2.md`](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md) (operator-supplied 2026-05-12).
**Pre-flight directives (visual + admin foundation):** D-500 (this doc), D-501 (PSCRM admin port).

This doc is the operator-facing tracker for V5 directive status. Mirrors `docs/V4_STATUS.md` shape; rows update as each directive ships.

---

## 1. Phase 0 — Pre-flight (visual + admin foundation)

| ID | Directive | Status | Notes |
|---|---|---|---|
| D-500 | Builtrix design system + dark Command Center shell | **shipped** | PR [#66](https://github.com/builtrixlabs/AI_CRM/pull/66) merged 2026-05-12 (`0f16306`). Preview: `https://ai-eys1f05rq-builtrixlabs-projects.vercel.app`. Light theme = Builtrix indigo/amethyst/copper; dark theme = Command Center cyber (teal/violet/mint/amber); `/dashboard` re-built as the Command Center home matching operator screenshots 1+3, with state-machine canvas matching screenshot 2. 9 RTL test files / 25 tests / all green. |
| D-501 | PSCRM superadmin + org admin foundation port | **shipped** (foundation slice) | PR [#68](https://github.com/builtrixlabs/AI_CRM/pull/68) merged 2026-05-12 + fix-up commit `a166820`. Preview: `https://ai-54m66asy7-builtrixlabs-projects.vercel.app`. Ships: AES-256-GCM `encryptJson`/`decryptJson`/`maskLast4` (D-501 src/lib/comms/encryption.ts) with separate `INTEGRATION_ENCRYPTION_KEY` env var; ported `OnboardingBanner` + `IntegrationFailureBanner` + `AppAccessCard` components; new `/admin/apps` + `/admin/integrations` index + `/settings` landing pages; re-skinned `/admin` landing. 4 test files / 23 tests / all green. Out-of-scope slices (generic /settings/integrations CRUD with /new+/[id], document-templates, support tickets org-side, verify-otp, full /platform polish) deferred to D-501.x follow-ups. |

## 2. Phase 1 — Per-org messaging multi-tenancy

Every directive below configures provider credentials **per organization**, by the `org_admin`, inside the application. The operator is never the source of provider creds. See [`memory/per_org_integration_model.md`](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md).

| ID | Directive (plan v2) | Status | Depends on |
|---|---|---|---|
| D-433 | Live Exotel telephony + per-org config | **shipped** | PR [#69](https://github.com/builtrixlabs/AI_CRM/pull/69) merged 2026-05-12. Live Exotel `TelephonyAdapter` (outbound + lookup + test-ping), `org_telephony_config` table + redacted view, admin UI at `/admin/integrations/telephony`, HMAC-verified call-status webhook scaffolding. Migration `20260512120000` applied; `verify_d433.mjs` 8/8 PASS. 3 test files / 27 tests green. |
| D-439 | Unified `/admin/integrations` index + health badges | **shipped** | PR [#71](https://github.com/builtrixlabs/AI_CRM/pull/71) merged 2026-05-13. `getIntegrationsHealth(orgId)` aggregates per-channel rows; new `IntegrationHealthBadge` (✓ Healthy / ⚠ Degraded / ⚪ Not configured / — Coming soon) slots into each `/admin/integrations` tile with detail surfaced via title attribute. Reordered before D-434/D-435/D-432 at operator request — channels light up as their directives ship. 2 test files / 15 new tests green. |
| D-434 | Live Resend email + per-org config | **shipped** | PR [#72](https://github.com/builtrixlabs/AI_CRM/pull/72) merged 2026-05-13. `ResendEmailProvider` (kind: "custom" send + test-ping against `/domains`), `org_email_config` table + redacted view, admin UI at `/admin/integrations/email`, Resend delivery-receipt webhook scaffolding. Migration `20260513120000` applied; `verify_d434.mjs` 8/8 PASS. 4 test files / 28 tests green. Templated mode + svix HMAC verification deferred. |
| D-435 | Live MSG91 SMS + DLT templates + per-org config | **shipped** | PR [#73](https://github.com/builtrixlabs/AI_CRM/pull/73) merged 2026-05-13. `Msg91SmsProvider` (v5 Flow API; template_id allowlist gated at adapter — sends with unregistered template_id fail-closed without contacting MSG91), `org_sms_config` + `dlt_templates` tables, admin UI at `/admin/integrations/sms` with inline DLT template CRUD (transactional / service / promotional). Migration `20260513130000` applied; `verify_d435.mjs` 11/11 PASS. 3 test files / 24 tests green. Gupshup SMS deferred to D-435.x. |
| D-432 | WhatsApp providers (Gupshup + Cloud API direct) + per-org config | **shipped** | PR [#74](https://github.com/builtrixlabs/AI_CRM/pull/74) merged 2026-05-13. New `src/lib/comms/whatsapp/` module (no D-418 shell existed). `GupshupWhatsAppProvider` (template/msg form-encoded) + `CloudApiWhatsAppProvider` (Graph API v17.0 JSON, language-code override). Both gate sends by org's `approved_template_ids`. `org_whatsapp_endpoints` extended (D-010 + provider/encrypted_credentials/approved_template_ids/from_*/test_ping_*). Admin UI with provider picker + approved-templates panel. Migration `20260513140000` applied; `verify_d432.mjs` 9/9 PASS. 4 test files / 27 tests green. |

## 3. Phase 2 — Sister-product API surface

| ID | Directive | Status | Depends on |
|---|---|---|---|
| D-440 | Per-org sister-product API tokens | planned | Voice IQ pattern (D-132 / D-134 ✓) |
| D-441 | Read API for PSCRM / lead-sources (deals, contacts, units, leads) | planned | D-440 |
| D-442 | Outbound event emissions for sister products | planned | D-311 webhook worker (✓) |
| D-443 | Inbound event handlers from sister products | planned | D-013 event inbox (✓) |

## 4. Phase 3 — Reporting + oversight

| ID | Directive | Status | Depends on |
|---|---|---|---|
| D-114 | Customizable reporting layer | planned | baseline 119 (operator authors) |
| D-111 | Canvas-of-canvases for manager + CXO | planned | D-500 |

## 5. Phase 4 — GA hardening

| ID | Directive | Status | Notes |
|---|---|---|---|
| D-125 | V1 hardening + pen-test prep + tag `v1.0` | planned | Run after all PRD §9 acceptance gates green |

---

## 6. Cumulative schema changes on V5

| Migration file | Directive | Applied | Adds |
|---|---|---|---|
| [`20260512120000_org_telephony_config.sql`](../supabase/migrations/20260512120000_org_telephony_config.sql) | D-433 | 2026-05-12 ✓ | `org_telephony_config` table (organization_id PK, provider CHECK incl. exotel + servetel/knowlarity/myoperator/ozonetel, encrypted_credentials JSONB, virtual_number, is_active, test_ping_*, provenance) + RLS (own-org SELECT only; INSERT/UPDATE/DELETE denied) + `org_telephony_config_redacted` view (omits ciphertext, exposes `is_configured` boolean) with SELECT grant to authenticated. Verified via `scripts/verify_d433.mjs`. |
| [`20260513120000_org_email_config.sql`](../supabase/migrations/20260513120000_org_email_config.sql) | D-434 | 2026-05-13 ✓ | `org_email_config` table (provider CHECK ∈ {resend, postmark}, encrypted_credentials, from_email, from_name, verified_at, is_active, test_ping_*) + RLS + `org_email_config_redacted` view. Verified 8/8. |
| [`20260513130000_org_sms_config_and_dlt.sql`](../supabase/migrations/20260513130000_org_sms_config_and_dlt.sql) | D-435 | 2026-05-13 ✓ | `org_sms_config` (provider CHECK ∈ {msg91, gupshup}, encrypted_credentials, sender_id, dlt_entity_id, is_active, test_ping_*) + `dlt_templates` (composite PK organization_id+template_id, content, category CHECK ∈ {promotional, transactional, service}, registered_at) both RLS org-scoped. Verified 11/11. |
| [`20260513140000_org_whatsapp_endpoints_extend.sql`](../supabase/migrations/20260513140000_org_whatsapp_endpoints_extend.sql) | D-432 | 2026-05-13 ✓ | EXTEND `org_whatsapp_endpoints` (D-010) with provider CHECK ∈ {gupshup, cloud_api} (nullable for V0 backward compat), encrypted_credentials, approved_template_ids text[] DEFAULT '{}', from_phone_number_id, from_display_number, test_ping_*. New `org_whatsapp_endpoints_redacted` view exposing is_configured + approved_templates_count. Verified 9/9. |

---

## 7. Test counts

```
v4 baseline entering v5:      1529 unit tests (passing; 9 pre-existing file-level failures from missing packages otpauth / @upstash/redis / bcryptjs)
v5 D-500 (PR #66):           +25 tests (shell 7 + command-center 18)
v5 D-501 (PR #68):           +23 tests (encryption 6 + admin banners + app-access 17)
v5 D-433 (PR #69):           +27 tests (exotel 17 + org-config 5 + exotel-call-status 7)
v5 D-439 (PR #71):           +15 tests (health 9 + integration-health-badge 6)
v5 D-434 (PR #72):           +28 tests (resend 16 + email org-config 5 + resend webhook 4 + health email 6 — minus 3 base health overlap)
v5 D-435 (PR #73):           +24 tests (msg91 15 + sms org-config 5 + health sms 7 — minus 3 base health overlap)
v5 D-432 (PR #74):           +27 tests (gupshup 10 + cloud-api 10 + whatsapp org-config 7 + health whatsapp 8 — minus 8 base health overlap)
v5 current:                 ~1675 unit tests (full vitest run)
```

---

## 8. Sign-off checklist for v1.0 launch (plan v2 §7 + PRD §9 mirror)

- [x] D-433 shipped (Exotel adapter scaffolding live; per-org cred entry surfaces live once operator sets INTEGRATION_ENCRYPTION_KEY)
- [x] D-434 shipped (Resend adapter scaffolding live)
- [x] D-435 shipped (MSG91 + DLT template registry live)
- [x] D-432 shipped (Gupshup + Cloud API direct adapters live)
- [x] D-439 shipped (`/admin/integrations` health-badge index)
- [ ] D-440 / D-441 / D-442 / D-443 — PSCRM read+write API surface stable at `/api/sister/v1/*`
- [ ] D-114 — customizable reporting, 8 templates seeded, p95 < 3s
- [ ] D-111 — canvas-of-canvases for manager + CXO
- [ ] D-125 — RLS audit 100%, pen-test report, 0 P0 in trailing 30d
- [ ] First 3 paying customers signed
- [ ] Tag `v1.0` cut on `main`

---

## 9. Branch & merge model

- **V5 horizon branch:** `v5` (long-lived, cut from `v4@62ad076` on 2026-05-12).
- **Per-directive feature branches:** `feature/<NNN>-<slug>` cut from `v5`, PR'd back via Gate 5.
- **Bug fixes during V5 horizon:**
  - V4 in-flight fixes → push to `v4`, forward-port to `v5` weekly.
  - V1 live-pilot fixes → push to `v1`, forward-port to `v3` / `v4` / `v5`.
- **Watchdog branch for V5 post-merge:** `watchdog/v5-postmerge` — create when the first V5 directive merges (= now). Lands as part of D-501 or a dedicated infra commit.
- **Merge to main:** at the `v1.0` tag once §8 sign-off checklist completes.
