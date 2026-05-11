# V4 Build Plan v1 — execution order + dependency graph

**Source PRD:** [docs/PRD-v3.0.md](../PRD-v3.0.md)
**Status doc:** [docs/V4_STATUS.md](../V4_STATUS.md)
**Branch:** `v4` (cut from `v3@27c1f73` on 2026-05-11)
**Date:** 2026-05-11

This plan is the operator's per-directive sequencing guide for V4 (= PRD v3.0 V1 phase, D-110 → D-125). It does **not** replace per-directive Plan Mode (Gate 2 of `scripts/v5/build.sh`); it sequences which directive enters Plan Mode next and surfaces the blockers each one needs cleared first.

---

## 1. Execution principle

**Internal-first.** A directive is "internal" if it has no external service dependency (no third-party API keys, no sister-product endpoint, no operator §10 decision blocking shape). Internal directives ship faster, derisk the data model, and unblock later integration work.

**External directives stack behind their unblockers.** Don't open Plan Mode for D-117 until the lead-source API keys are provisioned. Don't open Plan Mode for D-118 until the telephony provider is picked.

---

## 2. Phase A — Internal-only foundations (no external blockers)

Order chosen for dependency-minimum-first.

| # | Directive | Why it goes here | Depends on |
|---|---|---|---|
| A1 | **D-112** Custom fields engine (L1) | JSONB + canvas integration. Unblocks D-113 + D-114. Pure schema + UI. | — |
| A2 | **D-113** Custom views engine (L2) | View selector on list pages. Needs D-112's custom-field metadata. | D-112 |
| A3 | **D-110** Deal + Contact + Property + Unit canvases | Canvas shells for all RE entities. Reuses lead-canvas pattern from V0 D-007. | — (can run parallel to A1/A2) |
| A4 | **D-120** RE Inventory module | Project/Tower/Floor/Unit schema + 7-state availability state machine. Internal. | D-110 (Unit canvas) |
| A5 | **D-121** Booking Pipeline | 8-stage Deal lifecycle, milestone payments. Internal **except** demand-letter PDF (§10.6 decision). Can ship core + defer PDF to a follow-on. | D-110 (Deal canvas), D-120 (Unit booking lock) |
| A6 | **D-111** Canvas-of-canvases | Manager pannable view across leads/deals/contacts/units. Needs canvases to exist first. | D-110 |
| A7 | **D-114** Power BI–level reporting | Pivot + 8 dashboards + scheduled reports. Core is internal; LLM dashboard summaries depend on §10.4 (renderer) + LLM key. Ship core, defer LLM summaries. | D-112 (custom fields surface as pivot dims), D-120 (inventory dims), D-121 (booking-velocity dims) |
| A8 | **D-124** Bulk CSV import | Entity-agnostic, multi-user round-robin. Internal. Useful early for D-120 inventory seed. | D-112 (custom-field mapping) |

**Phase A halts at:** PRD §9 lines "Canvas p95 < 1.5s", "Pivot p95 < 3s", D-114 + D-120 + D-121 + D-124 acceptance.

---

## 3. Phase B — External integrations (blocked on operator action)

Listed in roughly-easiest-credential-first.

| # | Directive | Blockers |
|---|---|---|
| B1 | **D-115** Follow-up Agent T2 + approval queue + Stale-Lead Watcher | LLM key (model gateway from V0 D-010 — already present); WhatsApp BSP §10.3; outbound templates registered. Stale-Lead Watcher T0 already shipped on v3 (V3X_STATUS item 39) — reuse + extend. |
| B2 | **D-116** Custom Outbound Agent T3 | Same as B1. Draft-then-approve pattern reuses D-322 approval-queue from v3. |
| B3 | **D-117** Multi-source lead connectors | 7 source API credentials + universal webform endpoint design. Single biggest credential lift. |
| B4 | **D-118** External Telephony Adapter | §10.1 provider pick (Exotel default) + 1 alternate; provider sandbox accounts; inbound webhook + outbound click-to-call. |
| B5 | **D-119** Email + SMS multi-channel | §10.2 email provider + MSG91/Gupshup pick; DLT-template-registry seed; per-org email address provisioning. |
| B6 | **D-122** Legal Auditor event bus | Legal Auditor sister product alive; service-account token; document-pause/notify pattern. |

**Phase B halts at:** PRD §9 acceptance for D-117 / D-118 / D-119 / D-122 (production cohort runs).

---

## 4. Phase C — Intelligence + hardening

| # | Directive | Notes |
|---|---|---|
| C1 | **D-123** NL Cmd+K free-form (read-only) | §10.5 Haiku-vs-Sonnet decision; 200-query eval set authored; baseline 120 (NL compiler contract) landed. |
| C2 | **D-125** V1 hardening + pen-test + tag `v1.0` | Full RLS audit on all V1 tables; pen-test report; SOC2-readiness checklist update; tag `v1.0` cut. Cannot start until all PRD §9 acceptance gates green. |

---

## 5. PRD §10 decision matrix (operator owns)

| § | Decision | Affects | Recommendation framing |
|---|---|---|---|
| 10.1 | Telephony primary pick | D-118 | Cost + reliability per pilot's existing setup; Exotel is current default. |
| 10.2 | Email provider | D-119 | India deliverability + per-email cost at projected volume. |
| 10.3 | WhatsApp BSP | D-115 / D-116 | Volume pricing + template-approval turnaround. |
| 10.4 | Dashboard renderer | D-114 | Recharts is in-stack; heavyweight options forbidden by Constitution VII. |
| 10.5 | NL compiler model | D-123 | Eval-driven; ship the 200-query set then decide. Default to Haiku for cost; promote to Sonnet only if eval acceptance < 80%. |
| 10.6 | Demand letter PDF | D-121 | Puppeteer if Vercel serverless cold-start budget permits; otherwise templating service (DocSeal, Carbone). |

---

## 6. Per-directive Plan Mode protocol

For each directive: invoke the `feature-builder` agent with prose intent (e.g., "Build feature: D-112 custom fields engine"). The agent will:

1. Gate 1 — author `directives/<NNN>-<slug>.md` via the `directive-from-prompt` skill
2. Gate 2 — generate spec + plan + tasks + coverage targets; **surface Plan Mode for operator approve / edit / reject**
3. Gates 3–5 — TDD execution → verification → preview URL (auto, bypass-permissions)
4. Gate 6 — watchdog armed post-merge

If a directive's Plan Mode reveals unresolved §10 or missing credentials, reject and reschedule.

---

## 7. Directive numbering convention (operator decision)

PRD v3.0 uses D-110 through D-125. This repo's directive files use 3-digit prefixes (existing range: 001 → 330). Two reasonable mappings, **operator picks one**:

- **Option X (PRD-aligned):** D-110 → `directives/410-deal-contact-property-unit-canvases.md` (i.e., `4` + PRD's last two digits). Reads naturally with the v4 horizon.
- **Option Y (sequential):** continue the existing numeric stream — next directive is `331-...`. PRD's "D-NNN" appears only as a reference in the directive body.

Recommendation: Option X — explicit horizon prefix, easy to filter (`directives/4*.md`).

---

## 8. New baselines (PRD §7) — operator action, hook-bypass required

Hooks block writes to `baseline/**`. Each baseline must be authored or hook-bypass-authorized by operator before the dependent directive's Gate 2.

| Baseline | Blocks | Earliest needed |
|---|---|---|
| `116-comms-providers-contract.md` | D-118, D-119 | Phase B start |
| `117-inventory-data-model.md` | D-120 | Phase A4 |
| `118-booking-pipeline-contract.md` | D-121 | Phase A5 |
| `119-reporting-engine-contract.md` | D-114 | Phase A7 |
| `120-nl-compiler-contract.md` | D-123 | Phase C1 |
| `121-source-connectors-contract.md` | D-117 | Phase B3 |

---

## 9. What does NOT change from v3

- All v3 features stay live: audit retention (D-312), Stripe billing (D-310), MFA (D-300), RLS audit (D-302), webhook delivery (D-311), V3.x items (org retention overrides, hard-delete, token budgets, stale-lead-watcher T0, cross-workspace reassign).
- v3 → main merge cadence preserved. V3.x part 2 continuation (D-321 edit canvas, D-322 T3 LLM agent, items 17/18/24/28/30/47 from V3X_STATUS §5) can run on `v3` in parallel; forward-port to `v4` weekly.
- Watchdog `watchdog/v1-postmerge` unchanged. A new `watchdog/v4-postmerge` lands with the first V4 merge.

---

## 10. Memory updates landed alongside this plan

- `memory/v4_branching.md` (operator auto-memory) — scope locked to PRD v3.0 V1 phase (D-110 → D-125).
- `memory/MEMORY.md` — v4 line points to updated branching memory.

---

## 11. Open questions before Phase A starts

The agent will not begin Phase A until these are answered:

1. **Directive numbering convention** — Option X (4NN) or Option Y (sequential)?
2. **Baselines** — Will operator author the 6 baselines (PRD §7) before each Plan Mode, or authorize hook bypass to let the agent draft them under Plan Mode review?
3. **Demand-letter approach** — Puppeteer or templating service? Affects D-121 scope.
4. **Dashboard renderer** — Confirm Recharts (default) or specify alternative? Affects D-114 scope.
5. **Order confirmation** — Phase A in the order D-112 → D-113 → D-110 → D-120 → D-121 → D-111 → D-114 → D-124, or operator preference?

When the answers land, the agent invokes `feature-builder` for the first Phase A directive and surfaces Plan Mode.
