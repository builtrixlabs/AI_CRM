# Directive 501 — PSCRM superadmin + org admin foundation port

**Status:** Authored
**Date:** 2026-05-12
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/501-pscrm-admin-port` → PR target `v5`
**Pre-flight for:** D-433 onwards in [AI_CRM-4 order of implementation v2](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)
**Memory:** [v5_branching](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/v5_branching.md), [per_org_integration_model](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md), [pscrm_admin_full_port](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/pscrm_admin_full_port.md)

## 1. Problem

D-500 locked the visual language. D-433 (Live Exotel telephony + per-org config) needs:
- A general-purpose **AES-256-GCM encryption helper** for at-rest credential storage.
- A **`/admin/integrations` index page** so the new telephony admin UI has a navigable parent route.
- The **org-admin banner + app-access pattern** PSCRM established (`OnboardingBanner`, `IntegrationFailureBanner`, `AppAccessCard`) so the existing `/admin` landing matches PSCRM's polish AND surfaces "you haven't configured an email integration yet" warnings the moment D-434 / D-432 ship.

D-501 is the *foundation slice* of the broader PSCRM admin port (memory: `pscrm_admin_full_port`). It ports what D-433 / D-434 / D-435 / D-432 / D-439 need to plug into. Subsequent slices (document-templates, support tickets org-side, verify-otp, full /platform polish) land as D-501.x follow-ups.

## 2. Scope (in)

1. `src/lib/comms/encryption.ts` — AES-256-GCM helpers (`encryptJson`, `decryptJson`, `maskLast4`). Mirrors `src/lib/webhooks/secret-crypto.ts` shape; uses separate env var `INTEGRATION_ENCRYPTION_KEY` so a key-rotation event on one surface doesn't blast both.
2. `src/components/admin/onboarding-banner.tsx` — port of PSCRM's onboarding banner, takes cockpit-shaped data, uses Builtrix amethyst tokens.
3. `src/components/admin/integration-failure-banner.tsx` — port of PSCRM's failure surface; takes channel + count and renders the amber warning.
4. `src/components/admin/app-access-card.tsx` — extracted from PSCRM's `/admin/apps` pattern; tiles for cross-product subscriptions.
5. `src/app/(admin)/admin/apps/page.tsx` — full apps view (CRM active, Voice IQ active, PS-CRM coming-soon, Legal Auditor coming-soon).
6. `src/app/(admin)/admin/integrations/page.tsx` — unified integrations index (placeholder for D-439 "integrations hub"); links to telephony / email / sms / whatsapp / voice-iq per-channel pages.
7. `src/app/(settings)/settings/page.tsx` — settings landing index (Users / Roles / Integrations).
8. `src/app/(admin)/admin/page.tsx` — re-skin: swap inline onboarding banner for the new component, add `IntegrationFailureBanner` placeholder, swap App access stub for the new `AppAccessCard`.
9. `.env.example` — declare `INTEGRATION_ENCRYPTION_KEY` (32-byte hex). Generation hint included.
10. `scripts/vercel-env-sync.mjs` — append `INTEGRATION_ENCRYPTION_KEY` to `RUNTIME_VARS` so the operator can sync per-branch.
11. Tests: RTL for the 3 components + roundtrip / key-validation / alg-validation for the encryption helpers.

## 3. Out of scope (deferred slices of the wider PSCRM port)

- Generic `/settings/integrations` CRUD with `/new` and `/[id]` — the per-channel pages from D-433+ implement their own (more featureful) admin surfaces, so the generic CRUD isn't load-bearing on the v1 path.
- `/settings/document-templates` (demand-letter templating) — PSCRM-specific; lives in PSCRM-the-product.
- `/settings/support` org-side ticket view + `/settings/verify-otp` — D-501.x follow-up if needed.
- Full `/platform` (superadmin) re-skin pass — pages already render in Builtrix tokens via shadcn semantics; explicit polish later.
- Drizzle-style schema introduction — keep raw SQL migrations via `scripts/apply_migration.mjs`.

## 4. Per-org integration model — locked

`INTEGRATION_ENCRYPTION_KEY` is the *application-side master key* used to encrypt **org-provided** credentials at rest. It is **not** a provider credential. Org admins still provide their own Exotel / Resend / MSG91 / Gupshup / Cloud-API keys via `/admin/integrations/<channel>`; we encrypt them with the master key before writing. See [memory/per_org_integration_model](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md).

## 5. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** every file in §2 exists.
2. **Tested:** new RTL + unit tests green via targeted vitest run.
3. **Typechecked:** `npx tsc --noEmit` clean for changed files.
4. **Migrations:** none (D-433 owns the first per-channel config table).
5. **Pushed:** `feature/501-pscrm-admin-port` pushed to origin; PR opened against `v5`.
6. **Vercel preview green:** preview reaches READY.
7. **UI verified on live preview:** sign-in renders, `/admin/integrations` renders the channel tiles (auth-gated for /admin pages; checked via build cleanliness + RTL tests).
8. **PR merged to v5** (squash + delete-branch).
9. **Post-merge v5 build green.**
10. **Status logged:** `docs/V5_STATUS.md` D-501 row `planned → shipped`.
