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
| D-110 | Deal + Contact + Property + Unit canvases | **partial** (D-410 delta shipped 2026-05-11 — PR #52 `d2f1007`, contact canvas + contact/deal list pages; consolidation pass added `CustomFieldsBlock` on contact canvas; customer-facing property/unit canvases deferred) | Canvas p95 < 1.5s |
| D-111 | Canvas-of-canvases (manager pannable view) | planned | — |
| D-112 | Custom fields engine (L1, JSONB) | **shipped** (D-020 pre-v3 — table + RLS + admin UI + canvas integration; V2 deltas in non-goals) | — |
| D-113 | Custom views engine (L2, view selector) | **shipped** (D-413 / PR #50 / `feat(D-413)` `4e7f241`; migration `20260511120000_custom_views.sql` applied live 2026-05-11; consolidation pass added `src/lib/views/compile-columns.ts` module + "Save current as view" affordance + `POST /api/views` programmatic dispatcher) | — |
| D-114 | Power BI–level reporting layer | planned | Pivot p95 < 3s; 8 templates live; ≥ 80% of active org admins use the layer (telemetry) |
| D-115 | Follow-up Agent T2 + approval queue + Stale-Lead Watcher | **mostly shipped** (v3 D-322 + item 39 watcher + D-415 PR #58 / `44f4227` — per-channel dispatch via D-418 adapters wired into approve action; whatsapp deferred to BSP directive) | — |
| D-116 | Custom Outbound Agent T3 | planned | — |
| D-117 | Multi-source lead connectors | **partial → deferred to V6** (D-417 universal webform endpoint + lead quarantine shipped 2026-05-11 — PR #54 `c845044` — and stays as the in-CRM fallback ingestion path. The source-specific adapters Meta/Google/JustDial/Sulekha/MagicBricks/99acres/Housing.com were never built and are **deferred**: V6 moves source ingestion to the Marketing Intelligence Hub sister product — D-604 `POST /api/sister/v1/leads`. See `docs/plans/v6-implementation-order.md` §5.6 + §9.) | superseded by D-604 (MIH inbound) |
| D-118 | External Telephony Adapter | **shell shipped** (D-418 / PR #56 / `ae4e3f9` — adapter interface + mock provider + registry; live providers wait on §10.1 + Exotel/Servetel/Knowlarity/MyOperator/Ozonetel creds) | Live with Exotel + 1 other provider |
| D-119 | Email + SMS multi-channel | **shell shipped** (D-418 / PR #56 — adapter interfaces + mock providers + registries for both; live providers wait on §10.2 (Postmark/Resend) + §10.3 (MSG91/Gupshup) + DLT registration) | DLT-compliant SMS; templates in registry |
| D-120 | RE Inventory module (Project/Tower/Floor/Unit) | **mostly shipped** (D-420 / PR #59 / `a395c6f` — full PRD §3 P4 hierarchy: `project` + `tower` node types, unit metadata superset (carpet/builtup/saleable, facing, view, PLC, parking, RERA-unit-id), 7-state availability machine (`available → held → blocked → booked → sold → registered → possessed`) via `transition_unit_state` RPC with row lock + audit, hourly `expire_inventory_holds` cron, 6 new perms, admin UI at `/admin/inventory`; migrations `20260511190000_re_inventory.sql` + `20260511191000_re_inventory_revoke_authenticated.sql` applied live 2026-05-11; customer-facing project/unit canvases deferred to D-421) | ≥ 1 customer with full project inventory loaded |
| D-121 | Booking Pipeline (Token → Possession → Handover) | **partial** (D-421 shipped 2026-05-11 — PR #60 `87601c6`, slice 1 of 4: 8-stage state machine on deal canvas + `transition_stage` SECURITY DEFINER RPC + audit table + RTL widget; D-422 milestones / D-423 demand-letter PDF / D-424 PSCRM+Legal Auditor event emissions deferred to follow-up directives per baseline 118 §10) | ≥ 1 deal traversed Token → Registration in production |
| D-122 | Legal Auditor event bus integration | planned | Voice IQ + Legal Auditor + CRM running together at ≥ 1 customer |
| D-123 | NL Cmd+K free-form (read-only) | planned | ≥ 80% acceptance on 200-query internal eval set; p95 < 2s |
| D-124 | Bulk CSV import + field mapping | planned | 10K+ row file imported successfully; quarantine surfacing works |
| D-125 | V1 hardening + pen-test + tag `v1.0` | planned | 100% RLS audit pass; 0 P0 incidents in trailing 30 days; first 3 paying customers signed |

---

## 2. New baselines required (operator action — hooks block `baseline/**`)

PRD §7 introduces 6 new baselines. These cannot be written by the agent — operator must author or explicitly authorize a hook bypass.

| # | File | Owner directive | Subject |
|---|---|---|---|
| 116 | `baseline/116-comms-providers-contract.md` | D-118 + D-119 | **provisional shipped** at [`docs/baselines/116-comms-providers-contract.md`](baselines/116-comms-providers-contract.md) via D-418 (PR #56). Promote to `baseline/116-*` post-V4-GA. |
| 117 | `baseline/117-inventory-data-model.md` | D-120 | **provisional shipped** at [`docs/baselines/117-inventory-data-model.md`](baselines/117-inventory-data-model.md) covering Project/Tower/Floor/Unit schema, 7-state availability machine, TTL contract, transition + hold-expiry RPC semantics, permission catalog, audit shape, migrations of record (runtime landed via D-420 / PR #59). Promote to `baseline/117-*` post-V4-GA. |
| 118 | `baseline/118-booking-pipeline-contract.md` | D-121 | **shipped** at [`baseline/118-booking-pipeline-contract.md`](../baseline/118-booking-pipeline-contract.md) via D-421 (PR #60) — stage definitions (8), transition matrix incl. named skips + role-gated rollback, audit shape, milestone ledger contract, demand-letter §10.6 lock, outbox event contract, RLS posture, directive slicing into D-421→D-424 |
| 119 | `baseline/119-reporting-engine-contract.md` | D-114 | Pivot query semantics, dashboard JSON schema |
| 120 | `baseline/120-nl-compiler-contract.md` | D-123 | NL → SQL plan grammar, confidence calibration, RBAC gate |
| 121 | `baseline/121-source-connectors-contract.md` | D-117 | **provisional shipped** at [`docs/baselines/121-source-connectors-contract.md`](baselines/121-source-connectors-contract.md) via D-418 (PR #56). Promote to `baseline/121-*` post-V4-GA. |

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
| 10.6 | Demand letter generation (Puppeteer vs templating) | D-121 | **decided** — in-process templating via `@react-pdf/renderer` (no SaaS, no vendor key). Locked in [baseline 118 §7](../baseline/118-booking-pipeline-contract.md). DocSeal/Carbone deferred to V1.5+ if a customer asks for countersigning. Actual PDF rendering lands with D-423. |

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
| [`20260511200000_agent_approval_queue_dispatch.sql`](../supabase/migrations/20260511200000_agent_approval_queue_dispatch.sql) | D-415 | 2026-05-11 ✓ | `agent_approval_queue` adds `sent_at`/`provider`/`provider_message_id`/`send_error` columns + channel CHECK extended to accept `'sms'` |
| [`20260511190000_re_inventory.sql`](../supabase/migrations/20260511190000_re_inventory.sql) | D-420 | 2026-05-11 ✓ | `nodes.node_type` CHECK adds `'project'` + `'tower'`; `custom_views.entity_type` CHECK mirrored; `nodes.state_expires_at timestamptz` + partial index; `transition_unit_state` RPC (row lock + transition graph + audit); `expire_inventory_holds` RPC (cron) |
| [`20260511191000_re_inventory_revoke_authenticated.sql`](../supabase/migrations/20260511191000_re_inventory_revoke_authenticated.sql) | D-420 | 2026-05-11 ✓ | Follow-up — explicitly revokes EXECUTE on `expire_inventory_holds` from `authenticated`/`anon` (service_role only) |
| [`20260511220000_booking_pipeline_stage_machine.sql`](../supabase/migrations/20260511220000_booking_pipeline_stage_machine.sql) | D-421 | 2026-05-11 ✓ | `deal_stage` enum (8 values, frozen) + `nodes.current_stage` column (NULLABLE; deal-typed rows only, backfilled to `'eoi'`) + `stage_transitions` audit table with `UNIQUE (deal_id, idempotency_key)` + RLS (SELECT for org members; INSERT/UPDATE/DELETE denied — RPC-only) + `transition_stage` SECURITY DEFINER RPC enforcing baseline 118 §4 matrix (forward-by-one, 2 named skips, role-gated single-step rollback, idempotency, provenance, row lock) |

---

## 6. Test counts

```
v3 baseline (entering v4):  1359 tests
v4 D-413 (PR #50):         +36 tests (compile-filters 25, admin 11)
v4 D-410 (PR #52):          +6 tests (contacts api)
v4 D-417 (PR #54):          +9 tests (webform ingest 7, token hash 2)
v4 D-418 (PR #56):         +18 tests (comms adapter shells: telephony 5, email 5, sms 3, registry 4, type 1 implicit)
v4 D-415 (PR #58):          +8 tests (follow-up dispatch: email + sms happy paths, missing recipients, whatsapp deferred, cross-tenant, idempotent, not-yet-approved gate)
v4 D-420 (PR #59):         +64 tests (state-machine 16, state-api wrappers 18, projects-api 7, towers+units 9, action-menu perm filter 8 plus shared fixtures)
v4 D-421 (PR #60):         +39 unit + 9 integration (stages matrix 21, booking api 4, DealStageTracker RTL 14, transition_stage RPC integration 9 against live Supabase)
v4 consolidation (PR TBD): +27 tests (compile-columns 7, webform inngest emit 3, views dispatcher route 13, DEAL_STAGES aliases 4) — also unblocked 9 pre-existing V3 test files that had stale node_modules
v4 current:                ~1594 unit tests + 9 integration delta
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
