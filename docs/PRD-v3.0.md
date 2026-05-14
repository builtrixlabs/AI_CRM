<!--
Sync Impact Report
==================
Version change: v2.0.0 → v3.0.0 (MAJOR — Priority curation; scope cut + scope add)
Source product: Builtrix AI-Native CRM (Real Estate)
Built on: Vibe Coding OS V5
Authority: Constitution v2.0 binding. CRM PRD v2.0 superseded by this document on the
sections explicitly addressed below; v2.0 remains the source for principles, schemas,
multi-tenancy, and RBAC where v3.0 does not restate them.

CURATION DECISIONS (vs. v2.0)
=============================

REMOVED — not building, ever (these were never strategic):
  - Mobile app (native Android / iOS) — entire scope cut
  - GPS check-in / check-out for site visits
  - Map view of agents
  - In-CRM call recording (Voice IQ owns this — see PRD v1.0 for Voice IQ)

DEFERRED — V2 or later:
  - Quotation / Cost-sheet calculator
  - Channel Partner Portal V1 (was D-117)
  - Channel Partner commission ledger
  - Auto-dialer / power-dialer

KEPT — already strong vs. competition (no scope change):
  - Admin & Customization (RBAC, Custom fields, Custom views, Studio)
  - Intelligent Canvas (Lead canvas → all-entity canvas)
  - DOE Workflow Engine

ENHANCED — main investment areas:
  - Lead Management (multi-source capture is now P0)
  - Communication Stack (external telephony adapter + Email + SMS as discrete channels)
  - AI / Intelligence Layer (more agents, NL Cmd+K free-form, deeper Voice IQ integration)
  - Reporting (uplifted to "Power BI–level": pivot + drag-drop dashboards + NL queries)
  - RE-native primitives (Project/Tower/Floor/Unit with availability + booking pipeline)
  - Post-sales booking pipeline (Token → Possession → Handover) — fully built

NEW V1 directives:
  - D-117 — Multi-source lead connectors
  - D-118 — External Telephony Adapter (bidirectional, no recording)
  - D-119 — Email + SMS multi-channel comms
  - D-120 — RE Inventory module
  - D-121 — Booking Pipeline (post-sales)
  - D-123 — NL Cmd+K free-form
  - D-124 — Bulk CSV import + field mapping

V0 unchanged (D-001 → D-015).

-->

# Builtrix AI-Native CRM — Product Requirements Document v3.0

> **⚠️ ARCHIVED (2026-05-14) — superseded on scope by [`docs/PRD-v6.0.md`](./PRD-v6.0.md).**
> Retained as the **V0–V5 source of truth**: V0/V2/V3/V4/V5 directives, schemas, and shipped scope trace back here, and `docs/V5_STATUS.md` still references it. It is **no longer the active scope authority.** V6 narrows scope to presales + sales engagement — the booking pipeline, RE inventory, catalog, demand letters, and source-specific lead connectors described below are REMOVED / DEFERRED / DORMANT in V6 (see [`docs/plans/v6-implementation-order.md`](./plans/v6-implementation-order.md) §2 + §9). Constitution v2.0 remains binding. Do not plan new work against this document — use the V6 docs.

**Product:** Builtrix CRM — AI-native real-estate sales & post-sales workforce
**Stack OS:** Vibe Coding OS V5
**Version:** PRD v3.0 (Priority Curation — supersedes v2.0 on directives D-110 onward)
**Date locked:** 2026-05-11
**Authority:** Directive-level. Constitution v2.0 binds. Superseded sections of PRD v2.0 listed in Sync Impact Report above.

---

## Authority Order

```
hook → constitution → policy → baseline → memory → learned patterns → directive → conversation → THIS PRD
```

This PRD wins on scope decisions for V1. For multi-tenancy, RBAC, graph schema, and audit-log shape, **PRD v2.0 remains authoritative** — this document does not modify those.

---

## 1. Product Vision

**Builtrix CRM is the only CRM that real-estate teams stop fighting against.**

Other CRMs ask reps to feed them. Builtrix CRM has agents that feed it. Reps work the canvas; agents handle the data plumbing. Voice IQ listens to every call. The Lead Enrichment Agent scores every inbound. The Follow-up Agent drafts the next message. The system gets smarter the more the team uses it.

We compete on three axes incumbents (Sell.do, Rsoft, LeadSquared, Zoho) cannot match without rebuilding their stack:
1. **Agentic execution** — every workflow is an agent action, not a UI to click
2. **Voice IQ wedge** — every call is structured intelligence, not just an audio file
3. **RE-native primitives** — Project/Tower/Floor/Unit and the booking pipeline ship as first-class objects, not as custom-fields the customer must build

---

## 2. What This Product Is — and Is Not (v3.0 explicit)

**IS:**
- Multi-tenant SaaS for Indian real-estate sales & post-sales teams (builders + brokerages)
- Web-only application (responsive desktop & tablet — no native mobile, no PWA in V1)
- AI-native: agents are first-class actors with bounded tier authority
- Integrated with Voice IQ (sister product) for call intelligence
- Integrated with Legal Auditor (sister product) for document compliance

**IS NOT:**
- A native mobile app (deferred indefinitely; web-responsive is the bet)
- A telephony provider (we adapt to external providers — Exotel, Servetel, Knowlarity, MyOperator, Ozonetel)
- A call-recording system (Voice IQ owns this)
- A property listing portal (consumer-facing discovery is out of scope)
- A cost-sheet generator in V1 (deferred to V2)
- A channel-partner portal in V1 (deferred to V2)
- A field-force tracking tool (no GPS, no maps, no attendance)

**Operator promise:** every "we don't build this" decision is in service of one bet — agentic AI + RE primitives + booking pipeline beats horizontal CRM on the things that move builder revenue.

---

## 3. Core Product Principles (curated v3.0)

### P1. Lead Management — every source, no manual entry

Every marketing rupee a builder spends produces a lead somewhere. The CRM must capture **all of them**, automatically, with full source attribution and provenance.

**V1 connectors (D-117):**

> **V6 (2026-05-14):** D-117's source-specific connectors below were never built and are **deferred**. V6 moves lead ingestion to the Marketing Intelligence Hub sister product (D-604, `POST /api/sister/v1/leads`), which dedupes + curates upstream; the universal webform endpoint (D-417) remains the in-CRM fallback. See `docs/plans/v6-implementation-order.md` §5.6 + §9.

- Webforms (any source, via universal API endpoint with org-scoped token)
- Meta Lead Ads (Facebook + Instagram)
- Google Ads (Lead Form Extensions)
- JustDial (XML/email feed)
- Sulekha (XML/email feed)
- MagicBricks (lead push API)
- 99acres (lead push API)
- Housing.com (lead push API)
- Walk-in / offline (CSV bulk + manual)
- Channel partner submission (basic — full portal deferred to V2)

**Provenance fields written on every lead:**
- `source` (e.g., `meta_lead_ads`)
- `source_campaign_id`, `source_adset_id`, `source_ad_id`
- `source_channel` (paid_social | paid_search | aggregator | organic_web | walk_in | cp)
- `source_received_at` (timestamp from source)
- `source_payload` (full raw JSON archived for audit)
- `created_via` agent service-account ID

**No lead is ever lost to a parsing failure.** Failed transformations land in a `leads_quarantine` table with full payload, surfaced to org admin within 5 minutes.

### P2. Communication Stack — adapter-first, channel-by-channel

We do not build a telephony provider. We build a **bidirectional adapter** that lets the CRM control any major Indian telephony provider via a unified API surface (D-118).

**Telephony Adapter capabilities:**
- Outbound click-to-call from any Canvas (Lead / Deal / Contact)
- Inbound call routing — incoming call rings the assigned rep's mapped extension
- Disposition write-back — call outcome (connected / RNR / wrong number / scheduled / etc.) lands on Lead canvas as Activity node
- Real-time call status (ringing / connected / ended) streamed to Canvas
- Provider-agnostic: pluggable connectors for Exotel, Servetel, Knowlarity, MyOperator, Ozonetel
- **No call recording** — that's Voice IQ's job. The Adapter emits a `call.completed` event with provider call_id; Voice IQ ingests separately.

**Email channel (D-119):**
- Inbound: per-org dedicated email address (or domain forwarder); messages parsed → activity node on matching lead/deal
- Outbound: templated (T2, via Follow-up Agent) and custom (T3, via Custom Outbound Agent)
- Threading: replies attach to original thread
- Provider: Postmark or Resend (final pick locks in baseline 116)

**SMS channel (D-119):**
- Outbound: templated (T2 only — SMS is one-way; no inbound webhook)
- DLT-compliant template registry per org
- Provider: MSG91 or Gupshup (locks in baseline 116)

**WhatsApp (already in V0 inbound; outbound expanded in D-115/D-116):**
- Inbound webhook (D-011) → activity node
- Outbound templated (D-115) → Follow-up Agent
- Outbound custom (D-116) → Custom Outbound Agent
- Provider: WhatsApp Business API via AiSensy or Gupshup

### P3. Appointments — site visits without GPS

Appointments are a first-class node type (`site_visit`) introduced in V0 D-013. v3.0 keeps the V0 implementation but **explicitly removes** GPS check-in and map view from scope.

**What stays:**
- Site visit scheduling on Canvas
- Google Calendar two-way sync (Outlook in V2)
- 24h confirmation reminder + 2h "directions + parking" reminder (DOE directives D-03 & D-04, agent tier T2)
- Status workflow: Scheduled / Confirmed / Completed / Cancelled / No-show
- Post-visit feedback request (DOE directive D-05, T2 draft / T3 send)
- Linkage to specific Property / Unit nodes (the "what was shown")

**What's removed:**
- Mobile GPS check-in / check-out
- Map view of executive locations
- Field-force attendance (Day Start / Break / Day End)

**Rationale:** office-bound sales teams in real estate do most coordination over WhatsApp + phone. Field-force tracking is theatre. If a rep is on-site, the post-visit Activity Stream + Voice IQ call intelligence gives the manager more signal than GPS coordinates ever did.

### P4. RE Inventory — Project / Tower / Floor / Unit (D-120)

Real estate runs on **inventory**, not "products". This is non-negotiable and missing entirely from horizontal CRMs.

**Hierarchy:**
```
Organization
  └── Project (e.g., "Prestige Lakeside Habitat")
       ├── Tower / Phase / Block (multiple)
       │    └── Floor (multiple per tower)
       │         └── Unit (apartment / villa / plot)
       │              ├── Unit Type (1BHK / 2BHK / 3BHK / 4BHK / Studio / Plot)
       │              ├── Carpet area, Built-up, Saleable area
       │              ├── Facing, View, Corner / Mid
       │              ├── Floor rise factor
       │              ├── Base price, ₹/sqft
       │              ├── PLC (Preferred Location Charge)
       │              ├── Parking allotment
       │              └── RERA ID
       └── Project metadata
            ├── RERA registration number
            ├── Possession date (committed + revised)
            ├── OC / CC status
            ├── Approved layout / sanction
            └── Brochure / floor plans (Storage)
```

**Unit availability lifecycle (state machine):**
```
Available → Held (reversible, expires in N hrs)
         → Blocked (rep-confirmed soft block, expires in N days)
         → Booked (token paid, irreversible without manager override)
         → Sold (sale agreement signed)
         → Registered (sale deed registered)
         → Possessed (handover complete)
```

State transitions audit-logged with provenance. Concurrent booking attempts on the same unit are serialized at DB level (row lock).

### P5. Booking Pipeline — fully implemented in V1 (D-121)

The Deal canvas (D-110) gets a stage extension covering the entire post-EOI lifecycle:

| Stage | Meaning | Trigger to next | Agent involvement |
|---|---|---|---|
| **EOI** | Buyer expressed interest | Token amount paid | Lead Enrichment Agent — score, source-attribute |
| **Token** | Token receipt confirmed | Booking form signed | Follow-up Agent — drafts welcome + booking checklist |
| **Booking** | Booking form signed + checklist complete | Sale Agreement drafted | Legal Auditor — pre-flag agreement clauses (D-122) |
| **Sale Agreement** | Agreement signed by both parties | Loan sanction (if applicable) | Voice IQ — flags any verbal commitments made on calls |
| **Loan / Finance** | Bank sanction OR cash track | Final demand letter generated | Follow-up Agent — milestone reminders |
| **Registration** | Sale deed registered | Possession scheduling begins | Legal Auditor — registration evidence stored |
| **Possession** | Keys handed over | Handover checklist complete | Custom Outbound Agent — drafts handover communication |
| **Handover Complete** | Defect liability period begins | (terminal — moves to post-possession service) | None — handed to PSCRM |

**Each stage transition writes:**
- Audit log entry (Constitution Principle IV)
- Provenance (who, when, on what evidence)
- DOE directive invocations (e.g., generate demand letter on Loan→Registration)

**Milestone payments:**
- Demand letter generation (PDF, templated, on stage transition)
- Payment receipt logging (manual entry V1, payment-gateway webhook V2)
- Outstanding balance tracker on Deal canvas

**Hand-off contracts:**
- On `Booked` → emit event to PSCRM (PRD v2.0 sister-product)
- On `Sale Agreement` → emit event to Legal Auditor for retroactive audit
- On `Possession` → emit event to PSCRM for handover lifecycle

### P6. Reporting — Power BI–level in product (D-114, expanded)

Builders and brokerages currently buy a CRM AND a BI tool. We collapse this. v3.0 expands D-114 from "5 pre-built dashboards" to a full self-service analytics layer.

**V1 reporting layer:**

| Capability | Description |
|---|---|
| **Pivot table builder** | Drag-drop rows / columns / measures over any entity (leads, deals, units, calls, agents) |
| **Drag-drop dashboard builder** | Compose tiles (counters, charts, tables, gauges) onto a canvas; save & share |
| **Pre-built dashboards** | Ship 8 templates: Sales Funnel, Source Attribution, Agent Performance, Project Inventory, Booking Velocity, Call Intelligence (Voice IQ), Compliance Risk (Legal Auditor), Pipeline Health |
| **Filters** | Multi-axis, color-coded, saveable, shareable |
| **Targets** | Per agent, per team, per project — daily / weekly / monthly with achievement % |
| **Scheduled reports** | Auto-deliver to email + WhatsApp on cadence |
| **Export** | CSV, Excel, PDF |
| **NL queries** | "How many qualified leads from Meta in May closed in Sarjapur projects?" — answered via D-123 Cmd+K free-form |
| **Embedded LLM summaries** | Each dashboard auto-generates a 3-line "what's notable this week" caption |

**Stack note:** built natively on Postgres + materialized views + on-demand aggregation; no external BI tool. Long-running reports run async via Inngest jobs.

### P7. AI / Intelligence Layer — the moat

This is where we win. Six agents in V0/V1; tier-bounded; audit-logged.

**Agents shipped:**

| Agent | Tier | Scope | Lands |
|---|---|---|---|
| Lead Enrichment Agent | T1 | Sets intent score on every new lead; pulls public-domain firmographic context | V0 D-010 |
| Site Visit Reminder Agent | T2 | Sends 24h + 2h templated WhatsApp reminders | V0 D-013 |
| Voice IQ Sync Agent | T1 | Writes call insights from Voice IQ events back to lead/deal canvas | V0 D-014 |
| Follow-up Agent | T2 | Drafts + sends pre-approved templated comms (WhatsApp/Email/SMS) | V1 D-115 |
| Custom Outbound Agent | T3 | Drafts custom comms for human approval per action | V1 D-116 |
| Stale-Lead Watcher Agent | T0 | Surfaces stale leads to managers; drafts re-engagement | V1 D-115 (sub) |

**DOE Directive Library — V1 expansion (15 V0 + 8 V1 = 23 pre-built):**

| # | New V1 directive | Tier |
|---|---|---|
| D-16 | When a Voice IQ call insight indicates 'high intent', escalate to senior rep | T1 |
| D-17 | When inventory in a buyer's preferred config drops below 10%, notify rep + buyer | T1/T2 |
| D-18 | When a demand letter is overdue by 7 days, escalate to manager + draft reminder | T2 |
| D-19 | When a deal moves to Sale Agreement, dispatch document checklist to buyer via WhatsApp | T2 |
| D-20 | When a Legal Auditor HIGH flag fires, pause the deal and notify rep+manager | T1 |
| D-21 | When a lead from a paid source has not been called in 90 minutes, escalate | T1 |
| D-22 | When a booking is at risk (Voice IQ negative-sentiment + no follow-up in 48h), surface to manager | T0 |
| D-23 | When inventory state changes to Sold, auto-update the project dashboard tile | T0 |

**NL Cmd+K free-form (D-123) — re-instated from PRD v2.0 cuts:**

V1 introduces bounded free-form NL with the following safety pattern (Constitution Principle X — NL-Compile-Then-Apply):

```
User: "show me all hot leads from Meta this month that haven't been called"
   ↓
LLM compiler: parses → structured query plan
   ↓
Confidence check → if < 0.7, fall back to bounded catalog
   ↓
RBAC + RLS check → query plan rejected if scope-violating
   ↓
Execute → render result on Canvas with the compiled plan visible
   ↓
Audit log: query, plan, result count, user, timestamp
```

Free-form NL never writes data in V1. Read-only queries only. Mutation via NL is V2.

### P8. RE-Native Primitives — must

The graph data model already supports any node type (V0 D-002). v3.0 makes the following RE-specific node types **first-class with dedicated canvases and lifecycle:**

| Node | Canvas | Lifecycle | Directive |
|---|---|---|---|
| `lead` | Yes | EOI / Qualified / Booked / Lost | V0 D-007 |
| `contact` | Yes | (no lifecycle — buyer master) | V1 D-110 |
| `deal` | Yes | EOI → Handover (8 stages) | V1 D-110 + D-121 |
| `project` | Yes | Pre-launch / Launch / Construction / OC / Handover | V1 D-120 |
| `tower` | List view (no canvas — accessed from project) | (inherits project state) | V1 D-120 |
| `unit` | Yes | Available → Possessed (7 states) | V1 D-120 |
| `site_visit` | Yes | Scheduled → Completed | V0 D-013 |
| `call` | Activity-only | (no lifecycle) | V0 D-014 |
| `document` | Document viewer | Draft / Signed / Filed | V1 D-122 |

---

## 4. Phased Build Plan (v3.0 lock)

### V0 — MVP (Weeks 1–8) — UNCHANGED from PRD v2.0

| # | Directive | Status |
|---|---|---|
| D-001 | V5 scaffold + constitution + baselines | Authored |
| D-002 | Multi-tenancy foundation | Authored |
| D-003 | Graph data model | Authored |
| D-004 | RBAC engine | Authored |
| D-005 | Super admin surfaces | Authored |
| D-006 | Org admin cockpit + onboarding wizard | Authored |
| D-007 | Intelligent Canvas (Lead canvas) | Authored |
| D-008 | Lead create + edit + stage transitions | Authored |
| D-009 | Cmd+K bounded catalog (30 queries) | Authored |
| D-010 | Model Gateway V0 + Lead Enrichment Agent (T1) | Authored |
| D-011 | Activity Stream + WhatsApp inbound webhook | Authored |
| D-012 | DOE Workflow Engine V0 + 15 pre-built directives | Authored |
| D-013 | Site Visit node + Google Calendar | Authored |
| D-014 | Voice IQ event bus integration | Authored |
| D-015 | V0 hardening + pilot onboarding | Authored |

**V0 acceptance unchanged:** pilot onboarded < 30 min, 1 rep × 5 days × 10+ leads on canvas, p95 < 1.5s, Lead Enrichment Agent live, Site Visit reminders firing, Voice IQ insights landing on canvas.

### V1 — GA (Weeks 9–18) — RECURATED

| # | Directive | Scope (1-line) |
|---|---|---|
| D-110 | Deal + Contact + Property + Unit canvases | All RE entities get canvases |
| D-111 | Canvas-of-canvases (manager pannable view) | Manager visibility |
| D-112 | Custom fields engine (L1) | JSONB + canvas integration |
| D-113 | Custom views engine (L2) | View selector on list pages |
| D-114 | **Power BI–level reporting layer** | Pivot + drag-drop dashboards + scheduled reports + 8 templates + LLM summaries |
| D-115 | Follow-up Agent (T2) + approval queue + Stale-Lead Watcher | Tier-2 outbound + stale detection |
| D-116 | Custom Outbound Agent (T3) | Draft-then-approve outbound |
| D-117 | **Multi-source lead connectors** | Meta, Google, JustDial, Sulekha, MagicBricks, 99acres, Housing.com + universal webform endpoint |
| D-118 | **External Telephony Adapter** | Bidirectional, provider-agnostic (Exotel/Servetel/Knowlarity/MyOperator/Ozonetel), no recording |
| D-119 | **Email + SMS multi-channel comms** | Per-org email address, DLT-compliant SMS |
| D-120 | **RE Inventory module** | Project / Tower / Floor / Unit + availability state machine |
| D-121 | **Booking Pipeline** | Token → Possession → Handover, 8 stages on Deal canvas, milestone payments |
| D-122 | Legal Auditor event bus integration | Document compliance pause/notify |
| D-123 | **NL Cmd+K free-form (read-only)** | LLM-compiled queries with confidence + RBAC gate |
| D-124 | **Bulk CSV import + field mapping** | Entity-agnostic; multi-user round-robin assignment |
| D-125 | V1 hardening + pen-test + tag v1.0 | Full RLS audit, SOC2 readiness checklist |

**V1 acceptance:**
- Lead capture from minimum 6 sources running in production for ≥ 30 days
- External Telephony Adapter live with at least 2 providers (Exotel + 1 other)
- 1 builder customer onboarded with full project inventory loaded
- 1 deal flowing end-to-end through booking pipeline (Token → Registration)
- Reporting layer used by ≥ 80% of active org admins (telemetry)
- Voice IQ + Legal Auditor + CRM running together in production at ≥ 1 customer
- Canvas p95 < 1.5s, Pivot report p95 < 3s, NL Cmd+K p95 < 2s
- 0 P0 incidents in trailing 30 days

### V2 — Scaled GA (Weeks 19+) — out of scope of this PRD

Items deferred to V2 (with rationale):
- Cost-sheet / Quotation builder — buyers will tolerate manual cost-sheet creation in V1 if everything else works
- Channel Partner Portal V1 (submit + status) — most pilot customers run brokers via WhatsApp; not blocking
- Channel Partner commission ledger — needs CP portal first
- Auto-dialer / Power-dialer — only relevant to high-volume tele-sales orgs; not our pilot ICP
- Native mobile app — web-responsive sufficient; revisit only if pilot customers demand it
- Outlook calendar — Google-only in V1
- WhatsApp two-way conversational AI — V2
- NL-driven write actions — V1 is read-only NL
- Multi-currency / multi-region (international expansion) — India-only in V1
- Marketing automation / drip campaigns — adjacent product
- Walk-in kiosk / show-flat tablet UX — adjacent product

---

## 5. Cross-Reference: PRD v2.0 Sections Still in Force

| PRD v2.0 Section | Still authoritative in v3.0? |
|---|---|
| §1 Vision | Replaced by §1 of v3.0 |
| §2 Constitution alignment | Yes (Constitution v2.0 binding) |
| §3 Multi-tenancy model | Yes |
| §4 Super admin surfaces | Yes (D-005) |
| §5 Org admin cockpit | Yes (D-006) |
| §5.5 Custom fields/views/dashboards | §5.5.4 (dashboards) expanded by v3.0 §3 P6 |
| §5.6 /admin/agents | Yes (D-115/D-116 ship more agents) |
| §5.7 /admin/directives | Pre-built library expanded — v3.0 ships 23 directives, not 15 |
| §6 Domain model | v3.0 §3 P4/P5 add Project/Tower/Floor/Unit/Booking |
| §7 Graph schema | Yes (no schema changes) |
| §8 Lead lifecycle | Yes (V0 D-008) |
| §9 RBAC | Yes (V0 D-003) |
| §10 Channel Partner isolation | Deferred — but isolation principle remains for any future CP feature |
| §11 D-NNN directive list | Replaced by §4 V1 list above |
| §12 Phased rollout | Replaced by §4 above |

---

## 6. Constitution Cross-Reference (v3.0)

| Constitution Principle | Where in v3.0 |
|---|---|
| I. Agents Are Colleagues | §3 P7 (agent ladder, tier mapping) |
| II. Tenant Isolation Is Sacred | §3 P1 (per-org webhook tokens), all connectors |
| III. Provenance Is Mandatory | §3 P1 (lead provenance fields), §3 P5 (booking transitions) |
| IV. Immutable Audit Trail | §3 P5, §3 P7 (every agent action) |
| V. DOE Framework Compliance | §3 P7 (23 directives) |
| VI. Baseline Immutability | §3 P4 (Project/Tower/Floor/Unit becomes new baseline 117) |
| VII. Stack Discipline | §2 (no native mobile, no telephony build) |
| VIII. Single Source of Truth | §5 cross-reference table above |
| IX. Intelligent Canvas Is the Interface | §3 P8 (every node has a canvas) |
| X. NL-Compile-Then-Apply | §3 P7 (NL Cmd+K compiler with confidence + RBAC gate) |

---

## 7. New Baselines Introduced in V1

| Baseline | Lands in directive | Subject |
|---|---|---|
| `116-comms-providers-contract.md` | D-118 + D-119 | Telephony adapter interface, Email/SMS provider abstraction |
| `117-inventory-data-model.md` | D-120 | Project/Tower/Floor/Unit schema + availability state machine |
| `118-booking-pipeline-contract.md` | D-121 | Stage definitions, transition rules, demand letter format |
| `119-reporting-engine-contract.md` | D-114 | Pivot query semantics, dashboard JSON schema |
| `120-nl-compiler-contract.md` | D-123 | NL → SQL plan grammar, confidence calibration, RBAC gate |
| `121-source-connectors-contract.md` | D-117 | Per-source ingestion schema, retry/quarantine policy |

---

## 8. Glossary (additions for v3.0)

| Term | Definition |
|---|---|
| **External Telephony Adapter** | Provider-agnostic abstraction for outbound/inbound call control; we adapt, we don't build telephony |
| **Source provenance** | Full attribution chain on every lead: source + campaign + ad + payload + receipt timestamp |
| **Universal webform endpoint** | Single per-org HTTPS endpoint with token auth that any external system can POST a lead to |
| **Inventory state machine** | The 7-state lifecycle of a Unit (Available → Held → Blocked → Booked → Sold → Registered → Possessed) |
| **Booking Pipeline** | The 8-stage Deal lifecycle from EOI through Handover Complete |
| **Demand letter** | Templated PDF generated automatically on stage transitions, addressed to buyer for milestone payment |
| **Power BI–level reporting** | Self-service pivot + drag-drop dashboard layer that replaces external BI tools |
| **Pre-built dashboard** | One of 8 templates shipped in V1 — composable starting point for org admin |
| **Free-form NL** | LLM-compiled natural-language query input; bounded by RBAC + read-only in V1 |
| **Quarantine table** | Holding table for failed lead-source transformations, surfaced to org admin for manual triage |

---

## 9. Sign-off Checklist (before V1 launch)

- [ ] Constitution v2.0 alignment review (Plan Mode Gate 2)
- [ ] PRD v3.0 supersession of v2.0 §11/§12 acknowledged in commit log
- [ ] D-117: Lead capture from ≥ 6 sources running in production for 30 days
- [ ] D-118: External Telephony Adapter live with Exotel + 1 other provider
- [ ] D-119: Email + SMS channels DLT-compliant; templates in registry
- [ ] D-120: Inventory data model in production; ≥ 1 customer with full project loaded
- [ ] D-121: At least 1 deal traversed full booking pipeline (Token → Registration) in production
- [ ] D-114: Pivot reporting + 8 pre-built dashboards live; LLM dashboard summaries firing
- [ ] D-123: NL Cmd+K compiler hits ≥ 80% acceptance on internal eval set (200 queries)
- [ ] D-124: Bulk CSV import tested on 10K+ row file; quarantine surfacing works
- [ ] Voice IQ + Legal Auditor + CRM integrated in production at ≥ 1 customer
- [ ] RLS audit passes 100% on all V1 tables
- [ ] Canvas p95 < 1.5s, Pivot report p95 < 3s, NL Cmd+K p95 < 2s
- [ ] No P0 incidents in trailing 30 days
- [ ] First 3 paying customers signed at target ACV
- [ ] Tag `v1.0` cut on main

---

## 10. What This PRD Does Not Decide (escalation list for next iteration)

These are intentional unknowns — not gaps. Resolve before locking V1.5 / V2 PRD:

1. **Telephony provider primary pick** — Exotel is current default. Validate against pilot customer's existing setup.
2. **Email provider primary pick** — Postmark vs. Resend. Decide on cost + India deliverability.
3. **WhatsApp BSP primary pick** — AiSensy vs. Gupshup vs. direct Cloud API. Decide on volume pricing.
4. **Dashboard renderer** — Recharts (in-product) vs. lightweight embed. Avoid heavyweight (Tableau, Power BI Embedded) per stack discipline.
5. **NL compiler model** — Claude Haiku for cost vs. Sonnet for accuracy. Ship eval set with D-123.
6. **Demand letter generation** — server-rendered HTML → PDF (Puppeteer) vs. templating service. Decide in baseline 118.

---

*End of PRD v3.0.*
