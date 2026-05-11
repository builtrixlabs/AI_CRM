# V4 Status — planning baseline, zero directives shipped

**Date:** 2026-05-11
**Branch:** `v4` (cut from `v3@27c1f73` on 2026-05-11)
**Scope:** PRD v3.0 V1 phase — directives D-110 through D-125 (16 directives)
**Source of truth:** [docs/PRD-v3.0.md](PRD-v3.0.md)
**Status:** **PLANNING** — no V4 directives have been authored, no code has been written, no migrations have landed.

This doc is the operator-facing tracker for V4 directive status. It mirrors the
shape of [docs/V3_STATUS.md](V3_STATUS.md) but is populated as directives ship.

For the execution plan and dependency graph, see
[docs/plans/v4-plan-v1.md](plans/v4-plan-v1.md).

---

## 1. V1 directive table

All planned, none built. Acceptance criteria distilled from PRD §4 (V1 acceptance) + §9 (sign-off).

| ID  | Directive (PRD §4) | Status | Acceptance gate (from PRD §9 where stated) |
|---|---|---|---|
| D-110 | Deal + Contact + Property + Unit canvases | **partial** (D-410 delta shipped 2026-05-11 — PR #52 `d2f1007`, contact canvas + contact/deal list pages; customer-facing property/unit canvases deferred) | Canvas p95 < 1.5s |
| D-111 | Canvas-of-canvases (manager pannable view) | planned | — |
| D-112 | Custom fields engine (L1, JSONB) | **shipped** (D-020 pre-v3 — table + RLS + admin UI + canvas integration; V2 deltas in non-goals) | — |
| D-113 | Custom views engine (L2, view selector) | **shipped** (D-413 / PR #50 / `feat(D-413)` `4e7f241`; migration `20260511120000_custom_views.sql` applied live 2026-05-11) | — |
| D-114 | Power BI–level reporting layer | planned | Pivot p95 < 3s; 8 templates live; ≥ 80% of active org admins use the layer (telemetry) |
| D-115 | Follow-up Agent T2 + approval queue + Stale-Lead Watcher | planned | — |
| D-116 | Custom Outbound Agent T3 | planned | — |
| D-117 | Multi-source lead connectors | **partial** (D-417 shipped 2026-05-11 — PR #54 `c845044`, universal webform endpoint + lead quarantine; source-specific adapters Meta/Google/JustDial/Sulekha/MagicBricks/99acres/Housing.com deferred to follow-up directives once API keys land) | ≥ 6 sources running in production for ≥ 30 days |
| D-118 | External Telephony Adapter | planned | Live with Exotel + 1 other provider |
| D-119 | Email + SMS multi-channel | planned | DLT-compliant SMS; templates in registry |
| D-120 | RE Inventory module (Project/Tower/Floor/Unit) | planned | ≥ 1 customer with full project inventory loaded |
| D-121 | Booking Pipeline (Token → Possession → Handover) | planned | ≥ 1 deal traversed Token → Registration in production |
| D-122 | Legal Auditor event bus integration | planned | Voice IQ + Legal Auditor + CRM running together at ≥ 1 customer |
| D-123 | NL Cmd+K free-form (read-only) | planned | ≥ 80% acceptance on 200-query internal eval set; p95 < 2s |
| D-124 | Bulk CSV import + field mapping | planned | 10K+ row file imported successfully; quarantine surfacing works |
| D-125 | V1 hardening + pen-test + tag `v1.0` | planned | 100% RLS audit pass; 0 P0 incidents in trailing 30 days; first 3 paying customers signed |

---

## 2. New baselines required (operator action — hooks block `baseline/**`)

PRD §7 introduces 6 new baselines. These cannot be written by the agent — operator must author or explicitly authorize a hook bypass.

| # | File | Owner directive | Subject |
|---|---|---|---|
| 116 | `baseline/116-comms-providers-contract.md` | D-118 + D-119 | Telephony adapter interface, Email/SMS provider abstraction |
| 117 | `baseline/117-inventory-data-model.md` | D-120 | Project/Tower/Floor/Unit schema + availability state machine |
| 118 | `baseline/118-booking-pipeline-contract.md` | D-121 | Stage definitions, transition rules, demand letter format |
| 119 | `baseline/119-reporting-engine-contract.md` | D-114 | Pivot query semantics, dashboard JSON schema |
| 120 | `baseline/120-nl-compiler-contract.md` | D-123 | NL → SQL plan grammar, confidence calibration, RBAC gate |
| 121 | `baseline/121-source-connectors-contract.md` | D-117 | Per-source ingestion schema, retry/quarantine policy |

---

## 3. PRD §10 — six operator decisions still open

These shape directives, not just env vars. Resolve before locking the affected directive in Plan Mode.

| § | Decision | Blocks directive | Current default per PRD |
|---|---|---|---|
| 10.1 | Telephony provider primary pick | D-118 | Exotel (validate against pilot) |
| 10.2 | Email provider (Postmark vs Resend) | D-119 | TBD on cost + India deliverability |
| 10.3 | WhatsApp BSP (AiSensy vs Gupshup vs Cloud API) | D-115 / D-116 | TBD on volume pricing |
| 10.4 | Dashboard renderer (Recharts vs lightweight embed) | D-114 | TBD; avoid Tableau / Power BI Embedded |
| 10.5 | NL compiler model (Haiku vs Sonnet) | D-123 | TBD; ship eval set with D-123 |
| 10.6 | Demand letter generation (Puppeteer vs templating) | D-121 | TBD; locks in baseline 118 |

---

## 4. External credentials required (operator-provisioned)

Per-directive checklist. Without these, the affected directive can only land adapter scaffolding + mock-driven tests, not the production acceptance gate.

| Directive | Needed credentials |
|---|---|
| D-115 / D-116 | LLM provider key (model gateway exists from V0 D-010); WhatsApp BSP account + sender ID |
| D-117 | Meta Lead Ads app + page subscriptions; Google Ads Lead Form webhook secret; JustDial XML/email creds; Sulekha XML/email creds; MagicBricks lead-push API key; 99acres lead-push API key; Housing.com lead-push API key |
| D-118 | Exotel account + 1 other (Servetel / Knowlarity / MyOperator / Ozonetel) |
| D-119 | Postmark or Resend account; MSG91 or Gupshup SMS account; DLT-registered SMS templates |
| D-122 | Legal Auditor sister product endpoint + service-account token |
| D-123 | LLM provider key; 200-query eval set with expected query-plan outputs |

---

## 5. Cumulative schema changes on V4

Each row applied to live Supabase via `scripts/apply_migration.mjs` + verified post-apply.

| Migration file | Directive | Applied | Adds |
|---|---|---|---|
| [`20260511120000_custom_views.sql`](../supabase/migrations/20260511120000_custom_views.sql) | D-413 | 2026-05-11 ✓ | `custom_views` table + RLS + `profiles.view_defaults jsonb` + `set_view_default` RPC + immutability trigger |
| [`20260511180000_webform_endpoints_and_quarantine.sql`](../supabase/migrations/20260511180000_webform_endpoints_and_quarantine.sql) | D-417 | 2026-05-11 ✓ | `webform_endpoints` (sha256-hashed tokens, per-org) + `leads_quarantine` + RLS + pgcrypto |

---

## 6. Test counts

```
v3 baseline (entering v4):  1359 tests
v4 D-413 (PR #50):         +36 tests (compile-filters 25, admin 11)
v4 D-410 (PR #52):          +6 tests (contacts api)
v4 D-417 (PR #54):          +9 tests (webform ingest 7, token hash 2)
v4 current:                ~1410 tests
```

Per-directive test deltas recorded as each directive's Gate 2 (Tested) lands.

---

## 7. Sign-off checklist for V1 launch (PRD §9 mirror)

- [ ] Constitution v2.0 alignment review (Plan Mode Gate 2 on each V4 directive)
- [ ] PRD v3.0 supersession of PRD v2.0 §11/§12 acknowledged in V4 commit log
- [ ] D-117 acceptance — ≥ 6 sources in prod for 30 days
- [ ] D-118 acceptance — Exotel + 1 other live
- [ ] D-119 acceptance — DLT-compliant SMS; templates registered
- [ ] D-120 acceptance — ≥ 1 customer with full project inventory loaded
- [ ] D-121 acceptance — ≥ 1 deal Token → Registration in production
- [ ] D-114 acceptance — Pivot + 8 templates live; LLM summaries firing
- [ ] D-123 acceptance — ≥ 80% on 200-query eval
- [ ] D-124 acceptance — 10K+ row import; quarantine surfaces
- [ ] D-122 acceptance — Voice IQ + Legal Auditor + CRM at ≥ 1 customer in prod
- [ ] D-125 acceptance — RLS audit 100%; perf p95 budgets met; 0 P0 incidents in trailing 30 days
- [ ] First 3 paying customers signed at target ACV
- [ ] Tag `v1.0` cut on `main`

---

## 8. Branch & merge model

- **V4 horizon branch:** `v4` (long-lived, cut from `v3@27c1f73` on 2026-05-11).
- **Per-directive feature branches:** `feature/<file-number>-<slug>` cut from `v4`, PR'd back to `v4` via Gate 5 of the V5 build pipeline.
- **Bug fixes during V4 horizon:**
  - V1 live-pilot fixes → push to `v1`, forward-port to `v3` and `v4`.
  - V3.x continuation → push to `v3`, forward-port to `v4`.
- **Watchdog branch for V4 post-merge:** `watchdog/v4-postmerge` — create when the first V4 directive merges to `v4`.
- **Merge to main:** at the `v4.0` tag once §7 sign-off checklist completes.
