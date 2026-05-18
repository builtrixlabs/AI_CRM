# Directive 439 — Unified /admin/integrations health index

**Status:** Authored
**Date:** 2026-05-13
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/439-integrations-health-index` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 1.5](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)
**Memory:** [per_org_integration_model](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md)

## 1. Problem

D-501 shipped a static `/admin/integrations` index — pretty tiles but no live status. As D-433 lit Exotel (and D-434 / D-435 / D-432 will follow), the operator needs an at-a-glance health badge per channel: **✓ healthy · ⚠ degraded · ⚪ not configured · — coming soon**. Without it, the only way to know "is my org's email actually going out" is to navigate four pages deep.

D-439 reorders to **slot 1.5** but ships **before** the remaining per-channel directives (D-434/435/432) at operator request. This is fine: the framework reads from whichever `org_*_config` tables exist; new channels light up automatically as they ship.

## 2. Scope (in)

1. **`src/lib/integrations/health.ts`** — `getIntegrationsHealth(orgId)` returns `ChannelHealth[]` for the 5 known channels (telephony, email, sms, whatsapp, voice_iq). Reads from `org_telephony_config_redacted` (D-433) + `org_integration_secrets_redacted` (D-132). Email/SMS/WhatsApp report `unavailable` until their directives ship.
2. **`src/components/admin/integration-health-badge.tsx`** — small badge component that renders `healthy` / `warning` / `not_configured` / `unavailable` with a colour + optional tooltip detail.
3. **Update `src/app/(admin)/admin/integrations/page.tsx`** — fetch health per row at render time, slot the badge into each tile, surface `last_check_at` + `detail` underneath, link active tiles to their per-channel page.
4. **Tests:**
   - `tests/lib/integrations/health.test.ts` — mocked supabase paths covering: telephony healthy, telephony warning (test_ping_ok=false), telephony not_configured (no row), telephony deactivated (is_active=false), telephony never-pinged (warning), voice_iq healthy/missing, unavailable channels (email/sms/whatsapp).
   - `tests/components/admin/integration-health-badge.test.tsx` — renders each status variant with the correct label + colour.

## 3. Out of scope (lands with D-434 / D-435 / D-432)

- Per-channel writes — D-439 only **reads**. Each channel directive owns its own config table + admin UI.
- Live "ring a number now / send a probe message" active health checks. D-439 trusts the most recent saved `test_ping_*` fields; live re-probes are a separate operator-initiated action that already lives on each channel's admin page.
- failed_jobs surface integration (the count piping into `IntegrationFailureBanner`). That lands when D-434 / D-435 ship per-channel queues.

## 4. Per-org integration model — locked

D-439 is a **read-only summary** over the per-org config tables D-433/434/435/432 own. It contains zero hard-coded provider knowledge and never holds shared credentials — just renders the `(is_configured, is_active, test_ping_ok)` triple each channel exposes.

## 5. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** every file in §2 exists.
2. **Tested:** new vitest files green via `npx vitest run tests/lib/integrations tests/components/admin/integration-health-badge.test.tsx`.
3. **Typechecked:** `npx tsc --noEmit` clean for changed files.
4. **Migrations:** N/A.
5. **Pushed:** `feature/439-integrations-health-index` pushed; PR opened against `v5`.
6. **Vercel preview green.**
7. **UI verified on live preview:** sign-in renders; `/admin/integrations` renders the 5 tiles with badges (auth-gated; operator self-verifies).
8. **PR merged to v5** (squash + delete-branch).
9. **Post-merge v5 build green.**
10. **Status logged:** `docs/V5_STATUS.md` D-439 row `planned → shipped`.
