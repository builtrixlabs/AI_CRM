# Builtrix CRM — V6 Implementation Order

**Document 1 of 2** · Companion to [`../PRD-v6.0.md`](../PRD-v6.0.md)

**Repo location:** `docs/plans/v6-implementation-order.md` — operator-supplied 2026-05-14, brought into the repo verbatim on the `v6` branch.

> **BINDING AUTHORITY (operator instruction, 2026-05-14):** Anything that happens in V6 follows **this implementation order document only**. Phase order, directive sequencing, action codes (KEEP / REWIRE / REPACKAGE / REMOVE / DORMANT / DEFER), and the removal checklist in §5 are non-negotiable. `docs/plans/v6-plan-v1.md` operationalizes this document but does not override it. No alternative ordering is to be solicited.

**Date:** 2026-05-14
**Authority:** Supersedes V4/V5 plans on scope decisions. V0/V2/V3 shipped code stays unless flagged below.
**Source codebase:** `AI_CRM-5.zip` (Next.js 16 + Supabase + 48k LOC source + 36k LOC tests + 68 migrations + 69 directives).

---

## 0. Why this re-scope exists

The V0–V5 builds shipped a horizontally complete real-estate CRM: presales **+** booking pipeline **+** inventory **+** post-sales hooks **+** Legal Auditor hooks **+** channel-partner submission. Audit found:

1. **Core daily-use loop is broken end-to-end.** The agent-approves-a-draft → real-WhatsApp-sends path is unwired (mock provider hardcoded). The flagship `/dashboard` Command Center is hardcoded mockup. 12 Cmd+K shortcuts dead. Two main links 404. Per-org integration credentials get stored but never read at send time.
2. **Scope is too wide for V1 pilot.** Booking pipeline, demand letters, inventory state machine, Legal Auditor / PSCRM integration — none of these matter until a builder is actively using the presales loop daily and asking for them.
3. **Lead ingestion is being solved at the wrong layer.** Source-specific connectors (Meta/Google/JustDial/Sulekha/MagicBricks/99acres/Housing) belong in a separate **Marketing Intelligence Hub** (MIH) sister product that dedupes and curates. Putting them in CRM duplicates that work and produces dirty data.

V6 narrows scope to **presales + sales engagement only**, with two headline AI-native behaviors (brochure agent + site-visit agent). Everything else is removed, deferred, or dormant.

---

## 1. Priority Framework

The four-quadrant grid Raghava asked for, mapped to scope-cut + scope-add for V6:

| Quadrant | Build order | What it contains |
|---|---|---|
| **P1 · HIGH priority + HIGH importance** | Phase 0–2 (Weeks 0–6) | Anything blocking a real customer from using the core loop. Stabilization removals + wiring integrations + brochure agent + site visit agent + MIH inbound API + presales auto-allocation. |
| **P2 · MEDIUM priority + HIGH importance** | Phase 3 (Weeks 6–9) | Manager + org-admin UX redesign. N8N-style AI Workflow builder. Team-specific dashboards. Super admin operational tooling. |
| **P3 · HIGH priority + MEDIUM importance** | Embedded in P1/P2 phases | Quick wins, polish, and supporting features (brochure repo, predefined message templates, project↔sales mapping, customer recovery role, sidebar swap). |
| **P4 · MEDIUM priority + MEDIUM importance** | Phase 4 (Weeks 9–11) | Realtime updates, notifications, mobile responsive, unified contact timeline, AI workflow sandbox testing. |
| **DEFER / DORMANT / REMOVE** | Phase 0 (immediate) | Booking pipeline, demand letters, inventory, catalog editing, channel-partner full portal, Legal Auditor, PSCRM, source-specific lead connectors, property/unit customer canvases. |

---

## 2. Decision matrix — every existing directive

Reading the existing 69 directives against the new vision. Action codes:

- **KEEP** — works as-is, ship in V6
- **REWIRE** — code exists but needs to be connected (most pressing category)
- **REPACKAGE** — code exists but needs UX rename or scope adjustment
- **REMOVE** — delete code, drop tables, strip references (irreversible)
- **DORMANT** — leave code and tables in place but unmount routes; can be revived later
- **DEFER** — planned but never built; remove from active plan

### 2.1 V0 directives (D-001 → D-021)

| ID | Title | Action | Notes |
|---|---|---|---|
| D-001 | Multi-tenancy foundation | KEEP | Org isolation + RLS is rock-solid. |
| D-002 | Graph data model | KEEP | Nodes/edges/signals stay. |
| D-003 | RBAC engine | REPACKAGE | Add roles: `presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `site_visit_coordinator`. Drop unused inventory perms. |
| D-004 | Super-admin surfaces | REWIRE | Existing `/platform` scope insufficient. Extend to V6 super-admin requirements (see D-606). |
| D-005 | Org-admin onboarding | KEEP | 8-step wizard works. Update step 7 (integrations) to reflect new providers. |
| D-006 | Intelligent Canvas | KEEP | Lead canvas + activity stream is core. |
| D-007 | Lead lifecycle | KEEP | State machine works. |
| D-008 | Cmd+K bounded catalog | REWIRE | 12 placeholder shortcuts need real list pages OR strip them. See D-617. |
| D-009 | Model gateway + lead enrichment | KEEP | Anthropic/OpenAI gateway works. |
| D-010 | WhatsApp inbound + activity stream | KEEP | Webhook + ingestion real. |
| D-011 | DOE workflow engine | REPACKAGE | Engine stays. UI renamed to "AI Workflow" + replaced with N8N-style builder (D-611). `send_template_message` action upgraded from stub to real send. |
| D-012 | Site visit + reminder agent | REWIRE + EXTEND | Calendar widget shipped, but `/dashboard/site-visits` route missing. Massive extension needed for V6 site-visit module (D-602). |
| D-013 | Call audit event bus | KEEP | Voice IQ inbox real. |
| D-014 | V0 hardening | KEEP | Done. |
| D-015 | Pilot onboarding | KEEP | Done. |
| D-016 | Super-admin AI provider config | KEEP | Platform-level secrets working. |
| D-017 | Org-admin directive authoring | REPACKAGE | Rename "Directives" → "AI Workflows". UI rebuild (D-611). |
| D-018 | Users management | KEEP | Functional. |
| D-019 | Agent provisioning | KEEP | Functional. |
| D-020 | Custom fields | KEEP | Functional. |
| D-021 | Custom dashboards | REPACKAGE | Keep engine, add team-scoped publication (D-612). |

### 2.2 V2 directives (D-130 → D-225)

| ID | Title | Action | Notes |
|---|---|---|---|
| D-130 | Event inbox v2 (BANT, intent, NBA) | KEEP | Core Voice IQ payload handling. |
| D-131 | Voice IQ event kinds | KEEP | 4 event kinds wired. |
| D-132 | Voice IQ admin UI | KEEP | Per-org HMAC + delivery log. |
| D-134 | Leads lookup endpoint | KEEP | Voice IQ uses this to resolve lead by phone. |
| D-200 | Roles overrides UI | KEEP | RBAC override surface. |
| D-201 | Admin billing standalone | KEEP | `/admin/billing` works. |
| D-202 | Admin system health | KEEP | Light extension to surface integration failure counts. |
| D-203 | Platform subscriptions | KEEP | Suspend/cancel/reactivate works. |
| D-204 | API audit log + costs | KEEP | Token + API call rollup. |
| D-205 | Platform analytics | KEEP | 4 KPIs. |
| D-206 | Platform tickets | KEEP | Inbox + thread + reply. |
| D-207 | Platform settings (flags) | KEEP | Global flag editor. |
| D-208 | Admin webhooks | KEEP | Registration + delivery log. |
| D-209 | MFA freshness | KEEP | Banner + verify flow. |
| D-210 | Login rate-limit | KEEP | KV-backed. |
| D-220 | RERA/GSTIN polish | KEEP | Compliance badges. |
| D-221 | CP submission portal | DORMANT | Unmount `/cp/*` routes. Keep DB tables + `channel_partner` role. Revive when CP becomes priority. |
| D-222 | Site-visit calendar widget | REPACKAGE | Widget stays; underlying list page built fresh (D-602). |
| D-223 | Catalog browser | REMOVE | Drop `/admin/catalog`, drop catalog tables not referenced by leads/deals. |
| D-224 | Booking pipeline widget | REMOVE | Dashboard widget type purged. |
| D-225 | Demo data seeder | REPACKAGE | Update to seed V6-scoped data (no inventory, no booking pipeline stages). |

### 2.3 V3 directives (D-300 → D-330) + V3.x

| ID | Title | Action | Notes |
|---|---|---|---|
| D-300 | Real TOTP MFA | KEEP | Production-ready. |
| D-301 | Multi-instance rate-limit | KEEP | KV sliding-window. |
| D-302 | RLS audit + force-signout | KEEP | Critical security. |
| D-310 | Stripe billing | KEEP | Full Subscriptions integration. |
| D-311 | Webhook delivery worker | KEEP | Inngest cron + retries. |
| D-312 | Audit retention + time-series | KEEP | Prune crons. |
| D-320 | Catalog editing | REMOVE | Drop entirely with D-223. |
| D-321 | Deal canvas | REPACKAGE | Simplify — strip booking-pipeline stage UI. Deal becomes a thin wrapper to track "lead became a customer". |
| D-322 | Follow-up agent T2 + approval queue | KEEP + EXTEND | Approval queue is the canvas the brochure + site-visit agents push to (D-600, D-601). |
| D-330 | V1 hardening + pen-test prep | KEEP | OWASP + SOC 2 prep. |
| V3.x | DNS-rebinding, sparkline, retention overrides, tier retention, webhook encryption, auto-suspend, emit-on-event, hard-delete, token budget, stale-lead watcher, cross-workspace reassign | KEEP | All defensive/operational improvements. |

### 2.4 V4 directives (D-410 → D-421)

| ID | Title | Action | Notes |
|---|---|---|---|
| D-410 | Canvas list delta (contact + deal lists) | KEEP | Real-data list pages. |
| D-413 | Custom views engine | KEEP | Filters/columns/sort/per-user default. |
| D-415 | Follow-up per-channel dispatch | REWIRE | **Critical** — replace `pickProvider() → "mock"` with real per-org adapter instantiation (D-603). |
| D-417 | Universal webform endpoint | REPACKAGE | Stays as fallback ingestion path. Primary path becomes MIH inbound (D-604). |
| D-418 | Comms adapter shells | KEEP | Adapter interfaces. |
| D-420 | RE Inventory | REMOVE | Drop Projects/Towers/Units tables, `transition_unit_state` RPC, `expire_inventory_holds` cron, 6 inventory perms, `/admin/inventory`. Keep only project-name reference (D-608) for sales-person-by-project mapping. |
| D-421 | Booking pipeline stage machine | DORMANT | Don't drop migrations (`deal_stage` enum, `stage_transitions` table) — but unmount UI. Revival path preserved. |

### 2.5 V5 directives (D-500 → D-501, D-432 → D-443)

| ID | Title | Action | Notes |
|---|---|---|---|
| D-500 | Builtrix design system + Command Center shell | KEEP | Shell stays; **Command Center home page must be rebuilt with real data** (D-605). |
| D-501 | PSCRM admin port | KEEP | Foundation (encryption + banners). Drop "PSCRM" naming. |
| D-432 | WhatsApp providers (Gupshup + Cloud API) | REWIRE | Adapters real, must be invoked from dispatch (D-603). |
| D-433 | Live Exotel telephony | REWIRE | Same — wire into outbound + canvas click-to-call (D-603, D-609). |
| D-434 | Live Resend email | REWIRE | Same. |
| D-435 | Live MSG91 SMS + DLT | REWIRE | Same. |
| D-439 | Integrations health index | KEEP + EXTEND | Surface real failure counts to `/admin` cockpit banner. |
| D-440 | Sister-product API tokens | KEEP | Used for MIH auth. |
| D-442 | Sister-product outbound events | REPACKAGE | Drop PSCRM/Legal Auditor event kinds. Keep MIH-only event kinds. |
| D-443 | Sister-product inbound events | REPACKAGE | Drop PSCRM/Legal Auditor inbound paths. Keep MIH inbound only (now D-604). |

---

## 3. New directives for V6 (D-600 series)

Numbered to make ordering and dependencies obvious. Detailed specs in [Document 2 — PRD V6](../PRD-v6.0.md).

| ID | Title | Phase | Priority | Depends on |
|---|---|---|---|---|
| **D-600** | Brochure Agent — Voice IQ → brochure picker → WhatsApp draft → approval queue | Phase 2 | P1 | D-130, D-322, D-603, D-607 |
| **D-601** | Site Visit Booking Agent — Voice IQ → cab booking → customer WhatsApp → sales-rep auto-assign | Phase 2 | P1 | D-130, D-602, D-603, D-608 |
| **D-602** | Site Visit Module — list, detail, coordinator role, status workflow | Phase 1 | P1 | D-012 |
| **D-603** | Wire integration adapters into agent dispatch (the BIG ONE) | Phase 1 | P1 | D-432–D-435 |
| **D-604** | Marketing Intelligence Hub (MIH) inbound API — `/api/sister/v1/leads` | Phase 1 | P1 | D-440, D-443 |
| **D-605** | Command Center home — real data | Phase 1 | P1 | D-009 (gateway), existing canvas data |
| **D-606** | Super admin V6 — per-org impersonation + action logs + defect tracking + feature flags | Phase 3 | P2 | D-004 |
| **D-607** | Brochure Repository — org admin uploads, AI-readable metadata, RBAC-scoped | Phase 2 | P3 | D-020 (custom fields) |
| **D-608** | Project ↔ Sales-Person Mapping — manager configures who works which project | Phase 1 | P1 | D-018 |
| **D-609** | Click-to-call on canvas — wire Exotel adapter to lead/contact canvas | Phase 2 | P3 | D-603 |
| **D-610** | Pre-sales Auto-Allocation Engine — manager-configurable routing rules | Phase 1 | P1 | D-007 |
| **D-611** | AI Workflow Builder — N8N-style drag-drop, test-before-live, replaces Directives UI | Phase 3 | P2 | D-011, D-017 |
| **D-612** | Team-Scoped Dashboards — manager assigns dashboard to presales/telemarketing/recovery/sales team | Phase 3 | P2 | D-021 |
| **D-613** | App Access Sidebar — replace Voice IQ link, real connection status | Phase 0 | P3 | D-501 admin/apps page already exists |
| **D-614** | Predefined Message Templates — org admin configures auto-send vs approve | Phase 2 | P3 | D-322 |
| **D-615** | AI Agent Approval Workflow (manager creates → org admin approves) | Phase 2 | P3 | D-019, D-322 |
| **D-616** | Customer Recovery Team — role, queue, dashboard | Phase 3 | P3 | D-003 |
| **D-617** | Cmd+K shortcut completion — build real list-filter pages OR strip placeholders | Phase 1 | P2 | D-008 |
| **D-618** | Realtime updates across lists, deal canvas, dashboards | Phase 4 | P4 | postgres realtime |
| **D-619** | Notifications system — in-app + email + WhatsApp | Phase 4 | P4 | D-603 |
| **D-620** | Unified contact timeline across all leads/deals/calls | Phase 4 | P4 | D-410 |
| **D-621** | Mobile-responsive admin + dashboard | Phase 4 | P4 | — |

---

## 4. Phase-by-phase build order

### Phase 0 — STABILIZATION (Week 0–1)

**Goal:** Get to a clean, buildable state with the new scope. Mostly removal work.

**Branch:** `v6-stabilization` cut from `v5` tip.

| Step | Action | Effort | Removes |
|---|---|---|---|
| 0.1 | Drop catalog UI + DB tables not referenced by leads/deals | 0.5 day | `/admin/catalog/*`, catalog perms, related migrations marked obsolete |
| 0.2 | Drop inventory UI + tables + `transition_unit_state` RPC + `expire_inventory_holds` cron | 1 day | `/admin/inventory/*`, `nodes.project|tower|unit` rows (export first), 6 inventory perms, Inngest function |
| 0.3 | Drop booking pipeline UI (keep tables for revival) | 0.5 day | Deal canvas stage tracker, `BookingPipelineWidget`, `/dashboard/deals` stage column |
| 0.4 | Unmount CP routes (keep tables) | 0.5 day | `/cp/*` routes return 404, `channel_partner` role kept |
| 0.5 | Drop PSCRM + Legal Auditor sister-product hooks | 1 day | `post_sales_crm`, `legal_auditor` enum values from `product_kind` (migration to drop); update inbound handlers |
| 0.6 | Drop source-specific connector backlog (D-117 was never built — confirm clean delete from docs) | 0.5 day | Reference removals in PRD docs |
| 0.7 | Fix broken links: `/admin/support/new`, `/dashboard/site-visits` | 0.5 day | Either build minimal pages or remove the links |
| 0.8 | Rename "Directives" → "AI Workflows" in nav + page titles (UI-only rename, no engine change yet) | 0.5 day | Single PR |
| 0.9 | Swap sidebar "Voice IQ" entry → "App Access" (route already exists at `/admin/apps`) | 0.5 day | `D-613` |
| 0.10 | Update `scripts/demo/seed.ts` to V6 scope | 1 day | Strip inventory + booking pipeline + catalog seeding |

**Gate 0 (acceptance):** App builds clean. Zero references to dropped features. All existing tests pass minus the ones removed. Demo seed produces a V6-shaped org.

**Tests removed:** ~150 tests across catalog, inventory, booking pipeline.

---

### Phase 1 — CORE COMMS + LEAD INTAKE (Week 1–3)

**Goal:** Real outbound messages leave the system. Real leads come in from MIH. Pre-sales gets leads auto-allocated.

**Branch:** `v6-phase-1`

| Step | Directive | Effort | Why first |
|---|---|---|---|
| 1.1 | **D-603 — Wire integration adapters into agent dispatch** | 3–5 days | Single biggest gap. Without this, V6 is still mockware. |
| 1.2 | **D-604 — MIH inbound API** (`POST /api/sister/v1/leads` with full schema) | 2–3 days | Lead intake mechanism for the V6 product. |
| 1.3 | **D-610 — Pre-sales Auto-Allocation Engine** | 3–5 days | Routes incoming MIH leads to presales rep per manager rules. |
| 1.4 | **D-608 — Project ↔ Sales-Person Mapping** | 2–3 days | Foundation for D-601 site-visit auto-assign. |
| 1.5 | **D-602 — Site Visit Module** (list, detail, status workflow, coordinator role) | 5–7 days | Fixes the 404 + becomes the surface D-601 writes to. |
| 1.6 | **D-605 — Command Center home with real data** | 3–5 days | Fix the homepage that every user sees first. |
| 1.7 | **D-617 — Cmd+K shortcut completion** | 5–7 days | Replace 12 placeholders with real filtered list pages OR strip. |

**Gate 1 (acceptance):**
- Org admin enters Exotel + Resend + MSG91 + WhatsApp creds → test-ping passes → agent approves a follow-up draft → real message leaves to a test number/email.
- MIH POSTs a lead → it lands in CRM with full provenance → gets auto-allocated to a presales rep → appears on their dashboard within 5 sec.
- Site Visit tab loads, shows list of upcoming site visits, supports filtering by status, day click works.
- Command Center home shows real org-scoped KPIs (active leads count, hot pipeline count, today's site visits, MTD closed) computed from actual DB data.

**Test additions:** ~120 unit + 4 integration + 2 E2E.

---

### Phase 2 — AI-NATIVE BEHAVIORS (Week 3–6)

**Goal:** The two flagship AI agents work end-to-end.

**Branch:** `v6-phase-2`

| Step | Directive | Effort | Notes |
|---|---|---|---|
| 2.1 | **D-607 — Brochure Repository** | 3–5 days | Org admin uploads brochures with metadata (project, type, BHK, budget-band). Storage via Supabase Storage. RBAC-scoped read. |
| 2.2 | **D-600 — Brochure Agent** | 5–7 days | Voice IQ event `call.next_best_action` with `kind='send_brochure'` → AI picks brochure by metadata match → drafts WhatsApp template → approval queue OR auto-send (per D-614 config). |
| 2.3 | **D-609 — Click-to-call on canvas** | 2–3 days | Quick win once D-603 is in. Lead canvas + contact canvas show call button → invokes Exotel adapter → status updates as activity nodes. |
| 2.4 | **D-601 — Site Visit Booking Agent** | 7–10 days | Voice IQ event `call.next_best_action` with `kind='book_site_visit'` → button in agent approval surface → operator enters address + date/time → cab booking (initial: manual entry of driver/vehicle; future: Uber/Ola API) → customer WhatsApp message auto-drafted with cab details → sales person at project auto-assigned via D-608 mapping. |
| 2.5 | **D-614 — Predefined Message Templates** | 2–3 days | Org admin configures: which agent kinds auto-send vs approve. Per-template safety review. |
| 2.6 | **D-615 — AI Agent Approval Workflow** | 3–5 days | Manager authors agent workflow → goes to org admin approval queue → activate/reject loop. Audit-trailed. |

**Gate 2 (acceptance):**
- A Voice IQ call with `next_best_action='send_brochure'` produces an approval-queue row with the correct brochure attached and a customised WhatsApp body — operator approves — real WhatsApp goes out.
- A Voice IQ call with `next_best_action='book_site_visit'` produces a site-visit booking action — operator clicks button, enters cab details, submits — customer gets a WhatsApp message with cab info, and a sales rep at that project gets the site visit assigned.
- Manager creates an AI workflow → it lands in org-admin approval queue → org admin approves → workflow goes live.

**Test additions:** ~150 unit + 6 integration + 4 E2E.

---

### Phase 3 — MANAGER + ORG ADMIN UX (Week 6–9)

**Goal:** Org admin and manager can configure the system without engineering help. Super admin gets operational tooling.

**Branch:** `v6-phase-3`

| Step | Directive | Effort | Notes |
|---|---|---|---|
| 3.1 | **D-611 — AI Workflow Builder (N8N-style)** | 10–15 days | Replaces current Directives form-based UI. Drag-drop trigger + action nodes from a dropdown. Test-before-publish sandbox. The biggest UX investment in V6. |
| 3.2 | **D-612 — Team-Scoped Dashboards** | 5–7 days | Manager builds a dashboard and publishes it to a specific team (presales/telemarketing/recovery/sales). Team members see only what's published to them. |
| 3.3 | **D-616 — Customer Recovery Team** | 3–5 days | New role + auto-routing of stale/lost leads to recovery queue + recovery-specific dashboard. |
| 3.4 | **D-606 — Super admin V6 capabilities** | 5–7 days | Per-org impersonation (audit-logged), user action log viewer, defect tracking module, per-org feature flag matrix, per-org subscription tier override. |

**Gate 3 (acceptance):**
- Manager opens AI Workflow builder, drags a "WhatsApp inbound" trigger + "Update lead state" action, tests with a sample payload, publishes — workflow is live.
- Manager creates a custom dashboard for presales team, publishes — only presales users see it on their dashboard nav.
- Super admin impersonates an org, performs an action, exits — audit trail shows both the impersonation and the action.

**Test additions:** ~180 unit + 8 integration + 3 E2E.

---

### Phase 4 — POLISH (Week 9–11)

**Goal:** Feel-alive features. Pilot-ready.

**Branch:** `v6-phase-4`

| Step | Directive | Effort | Notes |
|---|---|---|---|
| 4.1 | **D-618 — Realtime updates** | 3–5 days | Extend existing canvas realtime to list pages + dashboards. |
| 4.2 | **D-619 — Notifications system** | 5–7 days | In-app bell + email + WhatsApp digest. Per-user notification prefs already in `profiles.notification_prefs`. |
| 4.3 | **D-620 — Unified contact timeline** | 3–5 days | Contact canvas shows all activities across all leads/deals associated with that contact. |
| 4.4 | **D-621 — Mobile-responsive admin + dashboard** | 5–10 days | Sales reps on the road need this. |

**Gate 4 (acceptance):** Pilot-ready. First builder onboarded.

---

### Phase 5 — V6 GA HARDENING (Week 11–12)

**Goal:** Tag `v6.0`.

| Step | Action | Effort |
|---|---|---|
| 5.1 | Full RLS audit re-run (all V6 tables) | 0.5 day |
| 5.2 | Update `tests/integration/rls-audit.test.ts` to cover new tables | 1 day |
| 5.3 | Update `tests/e2e/v2-acceptance.spec.ts` → `v6-acceptance.spec.ts` | 2 days |
| 5.4 | Pen-test cycle (refresh of D-330 against V6 surface) | 3–5 days (external) |
| 5.5 | Tag `v6.0` | — |
| 5.6 | First pilot onboarding via `scripts/seed-pilot-org.sh` (V6 version) | 1 day |

---

## 5. REMOVAL CHECKLIST (Phase 0 detail)

Step-by-step removals to get a clean V6 baseline. Each removal is its own commit so revert is surgical.

### 5.1 Catalog removal

```
# Files to delete:
src/app/(admin)/admin/catalog/                        # entire folder
src/components/canvas/(any catalog component)
src/lib/catalog/                                       # entire folder

# Permissions to drop from rbac.ts:
"catalog:admin_override"
"properties:view", "properties:create", "properties:edit", "properties:hold", "properties:release"
"units:view", "units:create", "units:edit"

# Sidebar entry: drop Catalog from CommandCenterSidebar.PRIMARY_NAV

# Tests to drop: tests/components/(catalog)*, tests/lib/catalog/*

# Migrations: NO drop migrations. Mark obsolete in V6_STATUS.md but leave tables intact for now (revival path).
```

### 5.2 Inventory removal

```
# Files to delete:
src/app/(admin)/admin/inventory/                       # entire folder
src/lib/inventory/                                     # entire folder
src/components/inventory/                              # entire folder
src/lib/inngest/functions/inventory-expire-holds.ts    # drop from inngest/route.ts too

# Permissions to drop:
"inventory:hold", "inventory:block", "inventory:book",
"inventory:sell", "inventory:register", "inventory:possess"

# DB: Mark migrations 20260511190000 + 20260511191000 obsolete in V6_STATUS.md
#     Tables and RPCs stay (revival path); UI gone.

# Sidebar entry: drop Inventory from CommandCenterSidebar
```

### 5.3 Booking pipeline removal (UI only)

```
# Components to drop:
src/components/canvas/deal-stage-tracker.tsx           # rebuild simpler version later
src/components/dashboard/booking-pipeline-widget.tsx   # gone

# Lib: lib/booking/ stays (revival path) but no longer imported from any route.

# DB: deal_stage enum + nodes.current_stage + stage_transitions table kept (revival path).
#     transition_stage RPC kept but unreferenced.
```

### 5.4 Channel Partner Portal dormancy

```
# Route: src/app/(cp)/cp/ — wrap layout in redirect("/auth/sign-in")
#        OR move folder to src/app/(cp).disabled/ and update layout.tsx to throw notFound()

# Role: keep "channel_partner" in base_role enum (DB) but new orgs can't assign it.

# Sidebar: no CP entries existed anyway.

# Demo seeder: drop 1 CP submission seed row.
```

### 5.5 Sister-product PSCRM + Legal Auditor dormancy

```
# Files to touch:
src/lib/integrations/sister-products/event-kinds.ts    # drop PSCRM + Legal kinds
src/lib/events/post-sales/                             # remove inbound handlers
src/app/api/sister/events/inbox/route.ts               # drop "post_sales_crm" + "legal_auditor" branches

# DB:
ALTER TYPE product_kind RENAME TO product_kind_old;
CREATE TYPE product_kind AS ENUM ('marketing_intelligence_hub');  -- V6 only
-- Migration write to update org_sister_product_tokens.product_kind values.

# Platform UI: /platform/sister-products only shows MIH tokens now.
```

### 5.6 Source-specific lead connector backlog

```
# These were never built. Just remove from docs/PRD-v3.0.md §3.1 + V4_STATUS.md table.
# The universal webform endpoint (D-417) stays as a fallback.
```

### 5.7 Naming swaps

```
# UI-only renames (no engine change):
"Directives"  -> "AI Workflows"  (everywhere: nav, page titles, breadcrumbs, toasts)
"Voice IQ" sidebar entry -> "App Access" (point to /admin/apps)

# Backend identifiers stay (directive table, directive_invocations etc.)
```

---

## 6. Schema changes for V6 (new migrations)

All additive. Tracked in `V6_STATUS.md` once Phase 0 lands.

| Migration | Directive | Adds |
|---|---|---|
| `20260520120000_role_extensions.sql` | D-003 ext | base_role enum adds `presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `site_visit_coordinator` |
| `20260520120100_brochure_repository.sql` | D-607 | `brochures` table (id, org_id, title, file_path, metadata JSONB with project/bhk/budget_band/area_sqft, uploaded_at, uploaded_by) + RLS |
| `20260520120200_site_visits_v6.sql` | D-602 | `site_visits` table extended: `cab_provider`, `cab_booking_ref`, `driver_name`, `driver_phone`, `vehicle_number`, `pickup_address`, `pickup_time`, `assigned_sales_rep_id`, `coordinator_id` |
| `20260520120300_project_sales_mapping.sql` | D-608 | `project_sales_assignments` (org_id, project_id, sales_rep_id, primary, created_at) + RLS |
| `20260520120400_presales_allocation_rules.sql` | D-610 | `lead_allocation_rules` (org_id, rule_priority, conditions JSONB, target_team, target_user_id, active, created_by) + RLS |
| `20260520120500_team_dashboards.sql` | D-612 | `team_dashboard_assignments` (dashboard_id, team_id, can_edit, published_at) + RLS |
| `20260520120600_mih_lead_inbound.sql` | D-604 | `mih_inbound_log` for dedup + audit, extends webhook contract |
| `20260520120700_message_template_policies.sql` | D-614 | `agent_message_policies` (org_id, agent_kind, mode = 'auto_send' | 'require_approval', updated_by) |
| `20260520120800_ai_workflow_versioning.sql` | D-611 | `directives.version`, `directives.parent_id`, `directives.test_payloads JSONB` |
| `20260520120900_super_admin_impersonation_log.sql` | D-606 | `super_admin_impersonation_log` (super_admin_id, organization_id, started_at, ended_at, reason) |

---

## 7. Test strategy for V6

**Approach:** every directive ships with unit + (where applicable) integration + (where critical) E2E tests. Coverage thresholds (80% lines / 90% branches) remain enforced on the V6-affected `src/lib/**` paths.

**New test suites required:**

| Suite | Covers |
|---|---|
| `tests/lib/agents/brochure-agent.test.ts` | D-600 — brochure match logic, template rendering, approval handoff |
| `tests/lib/agents/site-visit-agent.test.ts` | D-601 — VIQ event parsing, cab metadata validation, auto-assignment |
| `tests/lib/integrations/mih-inbound.test.ts` | D-604 — schema validation, dedup, provenance |
| `tests/lib/leads/allocation-engine.test.ts` | D-610 — rule matching priority, round-robin, fallback |
| `tests/lib/projects/sales-mapping.test.ts` | D-608 — primary rep selection, fallback logic |
| `tests/lib/workflow-builder/compile.test.ts` | D-611 — visual DAG → directive JSON round-trip |
| `tests/lib/dashboards/team-scoping.test.ts` | D-612 — team-filtered dashboard listing |
| `tests/lib/platform/impersonation.test.ts` | D-606 — start, audit, exit, cross-tenant isolation |
| `tests/integration/site-visit-end-to-end.test.ts` | D-601 + D-602 + D-603 — VIQ event → cab booking → WhatsApp send → assignment |
| `tests/integration/mih-to-presales.test.ts` | D-604 + D-610 — MIH POST → lead created → allocated to rep |
| `tests/e2e/v6-brochure-loop.spec.ts` | E2E — VIQ webhook → approval queue → operator approves → WhatsApp delivered |
| `tests/e2e/v6-site-visit-loop.spec.ts` | E2E — VIQ webhook → site-visit booking form → submit → cab + WhatsApp + assignment |

**Pen-test prep (D-330 refresh):**
- Re-score OWASP Top 10 against V6 surface
- Refresh RLS audit suite to include all V6 tables
- Add fuzz testing on `/api/sister/v1/leads` (MIH inbound) since it's a new external entry point

---

## 8. Rollback plan

If V6 Phase 1 reveals a fundamental wiring issue:

1. **`v6-phase-N` branch** stays separate from `v5`. Merge to `v5` only after Gate 5 sign-off (full GA).
2. **Watchdog `watchdog/v6-postmerge`** auto-reverts post-merge regressions on `main`.
3. **DB migrations are additive only.** Rollback is "stop using these tables" not "drop these tables". Existing V5 functionality keeps working on existing tables.
4. **Removed UI surfaces (Phase 0)** are recoverable from git history; the corresponding DB tables and RPCs are intentionally retained for revival.

---

## 9. What's deferred / dormant / removed — single source of truth

### DEFERRED (planned, not building in V6, can revisit V7+)

- D-114 — Power BI–level reporting layer
- D-117 source-specific lead connectors (Meta/Google/JustDial/Sulekha/MagicBricks/99acres/Housing) — replaced by D-604 MIH inbound
- D-122 — Legal Auditor event bus
- D-123 — NL Cmd+K free-form
- D-124 — Bulk CSV import + field mapping
- D-422 — Booking pipeline milestones
- D-423 — Demand letter PDF generation
- D-424 — Booking pipeline → PSCRM + Legal Auditor event emissions
- D-441 — Sister-product read API (CRM data → PSCRM)
- D-111 — Canvas-of-canvases manager pannable view

### DORMANT (built, unmounted, revival path preserved)

- Channel Partner Portal (`/cp/*` routes unmounted, tables kept)
- Booking Pipeline UI (deal stage tracker components removed, tables + RPC + enum kept)
- PSCRM + Legal Auditor sister-product hooks (handlers removed, token types narrowed)

### REMOVED (deleted, not reviving in current architecture)

- RE Inventory module — `/admin/inventory`, lib/inventory, components/inventory, inventory permissions, Inngest cron
- Catalog browser + editing — `/admin/catalog`, lib/catalog, catalog permissions
- Source-specific connector planning — purged from docs

### NEVER BUILDING (per PRD v3.0 plus V6 additions)

- Mobile native app (Android/iOS)
- GPS check-in / check-out
- Map view of agents
- Field-force attendance
- In-CRM call recording (Voice IQ owns)
- Auto-dialer / power-dialer
- Quotation / Cost-sheet calculator
- Trusted-device cookie for MFA (covered by freshness window)
- Property + Unit customer-facing canvases
- Demand letter PDF (deferred indefinitely until first paying customer asks)

---

## 10. Operator decisions still open

These shape directives, not just env vars. Resolve before locking the affected directive in Plan Mode.

| § | Decision | Blocks | Default |
|---|---|---|---|
| 10.1 | Cab booking provider | D-601 | Manual entry first (operator enters driver/vehicle/phone). Uber for Business / Ola Corporate as v6.x. |
| 10.2 | Brochure storage location | D-607 | Supabase Storage default. Switch to S3 if regional latency becomes an issue. |
| 10.3 | WhatsApp BSP for templated outbound | D-603 default | Pick one of Gupshup vs Cloud API per pilot; both adapters real. |
| 10.4 | AI workflow builder library | D-611 | Reactflow.dev (open source) for the DAG visual. Confirm license fit for commercial. |
| 10.5 | MIH inbound auth | D-604 | Bearer token via D-440 sister-product token. No mTLS for V6. |
| 10.6 | Team-dashboard publishing model | D-612 | "publish to team" copies the layout JSON; team members read-only. Edits by managers create a new revision. |

> **V6 operating note (operator instruction, 2026-05-14):** The agent does **not** re-solicit these decisions. Each row's **Default** is taken as the locked decision for V6 unless the operator amends this table directly. Per-directive Plan Mode (Gate 2) proceeds on the defaults.

---

## 11. Sign-off checklist for V6.0 launch

- [ ] Phase 0 stabilization merged to `v6` (~Week 1)
- [ ] Phase 1 Gate 1 acceptance complete (~Week 3)
- [ ] Phase 2 Gate 2 acceptance complete (~Week 6)
- [ ] Phase 3 Gate 3 acceptance complete (~Week 9)
- [ ] Phase 4 Gate 4 acceptance complete (~Week 11)
- [ ] RLS audit 100% on V6 tables
- [ ] Pen-test report green
- [ ] V6 acceptance Playwright suite green
- [ ] First paying customer signed
- [ ] Tag `v6.0` cut on `main`

---

## 12. Branch + merge model for V6

- **V6 horizon branch:** `v6` cut from `v5` tip at start of Phase 0.
- **Per-phase branches:** `v6-phase-N` cut from `v6`, merged back via Gate review.
- **Per-directive feature branches:** `feature/<NNN>-<slug>` cut from the current phase branch, PR'd back via Gate 5 of the Vibe OS pipeline.
- **Bug fixes during V6 horizon:**
  - V5 live-pilot fixes → push to `v5`, forward-port to `v6` weekly.
  - V6 in-flight fixes → push to phase branch, merge up.
- **Watchdog branch for V6 post-merge:** `watchdog/v6-postmerge` — auto-revert regressions.
- **Merge to main:** at the `v6.0` tag after §11 sign-off.

---

## 13. What to read next

- [`../PRD-v6.0.md`](../PRD-v6.0.md) — per-directive PRD for every D-600 series directive.
- [`v6-plan-v1.md`](./v6-plan-v1.md) — derived execution plan that operationalizes this document.
- `docs/V5_STATUS.md` (existing in repo) — what's currently shipped.
- `memory/per_org_integration_model.md` — context on per-org credentials posture.
- `directives/322-follow-up-agent-t2-approval-queue.md` — the approval queue D-600 + D-601 extend.

---

**End of Document 1.**
