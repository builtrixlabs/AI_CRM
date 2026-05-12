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
| D-501 | PSCRM superadmin + org admin full feature port | planned | Source zip at `C:\Users\ragha\Downloads\PSCRM_Claude-7.0.4`. Ports `/platform` + `/admin` + `/settings` surfaces (generic integrations CRUD, OnboardingBanner, IntegrationFailureBanner, app-access card, document-templates, support tickets org side, verify-otp). Drizzle → Supabase rewrite during port. Renders in the new Builtrix tokens. |

## 2. Phase 1 — Per-org messaging multi-tenancy

Every directive below configures provider credentials **per organization**, by the `org_admin`, inside the application. The operator is never the source of provider creds. See [`memory/per_org_integration_model.md`](../../../../.claude/projects/C--Users-ragha-OneDrive-Desktop-AI-CRM/memory/per_org_integration_model.md).

| ID | Directive (plan v2) | Status | Depends on |
|---|---|---|---|
| D-433 | Live Exotel telephony + per-org config | planned | D-418 shell (✓ on v4), D-500 (✓), D-501 (generic `/settings/integrations` CRUD shell) |
| D-434 | Live Resend email + per-org config | planned | D-418 shell (✓), D-501 |
| D-435 | Live MSG91 SMS + DLT templates + per-org config | planned | D-418 shell (✓), D-501 |
| D-432 | WhatsApp providers (Gupshup + Cloud API direct) + per-org config | planned | D-435 (DLT pattern), D-501 |
| D-439 | Unified `/admin/integrations` index + health badges | planned | D-433/4/5/2 shells |

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

None yet. D-500 was a UI / design-system directive (no migrations). D-433 onwards will land `org_<channel>_config` tables.

---

## 7. Test counts

```
v4 baseline entering v5:      1529 unit tests (passing; 9 pre-existing file-level failures from missing packages otpauth / @upstash/redis / bcryptjs)
v5 D-500 (PR #66):           +25 tests (shell 7 + command-center 18)
v5 current:                  ~1554 unit tests
```

---

## 8. Sign-off checklist for v1.0 launch (plan v2 §7 + PRD §9 mirror)

- [ ] D-433 live (Exotel + ≥ 1 alternate)
- [ ] D-434 live (Resend, sender-verified)
- [ ] D-435 live (MSG91 + DLT templates registered)
- [ ] D-432 live (Gupshup + Cloud API direct adapters)
- [ ] D-439 integrations index live
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
