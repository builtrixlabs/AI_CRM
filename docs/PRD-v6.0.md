# Builtrix CRM — PRD V6 (Presales + Sales Engagement)

**Document 2 of 2** · Companion to [`plans/v6-implementation-order.md`](./plans/v6-implementation-order.md)

**Repo location:** `docs/PRD-v6.0.md` — canonical V6 PRD. Operator-supplied 2026-05-14, brought into the repo verbatim on the `v6` branch. This document supersedes `docs/PRD-v3.0.md` on scope (see §1 Authority Order).

**Date:** 2026-05-14
**Authority:** Supersedes PRD v3.0 on scope. Constitution v2.0 still binding for multi-tenancy, RBAC base, audit, RLS.
**Status:** **PLANNING** — no V6 directives shipped yet.

---

## §0. Product Vision V6

**Builtrix CRM is the AI-native presales + sales engagement workbench for real estate teams.**

Other CRMs are forms reps fill out. Builtrix CRM listens to calls, drafts the next move, books the cab, and updates itself. Reps work the canvas; agents handle the plumbing.

**What we are:**
- Pre-sales + telemarketing + customer recovery + sales team workbench
- The destination for every lead a builder spends marketing money on (sourced via Marketing Intelligence Hub)
- A telephony + WhatsApp + email + SMS engagement layer with Voice IQ feeding intelligence after every call
- The system that auto-allocates leads, drafts follow-ups, books site visits, and assigns sales reps

**What we are not (V6 scope cuts):**
- Not a post-sales / bookings / demand-letter / possession tracking system (deferred — that's a future PSCRM build)
- Not a legal-clause auditor (deferred — future Legal Auditor build)
- Not a property/unit listing portal for customers (removed)
- Not an inventory management system (removed — RE Inventory module dropped)
- Not the lead aggregation layer (separated — MIH handles dedup + source ingestion)
- Not a channel-partner commission ledger (dormant — basic CP submit unmounted until needed)
- Not a mobile native app (out of scope per PRD v3.0)

**Three competitive axes:**
1. **AI-native engagement** — every follow-up, every site visit, every next-best-action drafted by an agent and ratified (or auto-sent) by a human.
2. **Voice IQ wedge** — every call produces BANT + intent + objection + next-best-action structured signal, not a raw recording.
3. **No-manual-entry intake** — leads arrive curated from MIH; the rep never types a phone number from a screenshot again.

---

## §1. Authority Order

```
hook → constitution → policy → baseline → memory → learned patterns → directive → conversation → THIS PRD
```

V6 wins on **scope decisions**. Constitution v2.0 wins on multi-tenancy, RBAC base, schema patterns, audit.

---

## §2. Roles (V6)

Extending the existing 9-role enum from `base_role`:

| Role | New in V6? | Purpose |
|---|---|---|
| `super_admin` | existing | Platform owner. Full per-org control + impersonation. |
| `org_owner` | existing | Primary contact for the org's subscription. |
| `org_admin` | existing | Configures the org — users, integrations, AI workflows, dashboards, billing, support. |
| `workspace_admin` | existing | Branch / workspace manager. Approves bulk operations within the workspace. |
| `manager` | existing | Team lead. Configures team dashboards, allocation rules, AI agent drafts. |
| `presales_rep` | **NEW** | Phones inbound leads, qualifies, books site visits. Default destination for MIH leads. |
| `telemarketing_rep` | **NEW** | Outbound calling on cold/aged leads. |
| `customer_recovery_rep` | **NEW** | Re-engages stale or terminal-state leads. |
| `sales_rep` | existing | Attends site visits, closes deals. |
| `site_visit_coordinator` | **NEW** | Single point of responsibility for cab logistics + driver coordination + customer cab-message dispatch. |
| `read_only` | existing | View-only access to lead/deal/contact data. |
| `channel_partner` | existing (dormant) | Submits leads to a partner org. CP UI unmounted in V6. |
| `service_account` | existing | API-only callers (MIH, Voice IQ, sister products). |

**Per-role landing pages:**
- `super_admin` → `/platform`
- `org_owner`, `org_admin` → `/admin`
- `manager` → `/dashboard?team=<their-team>` (team scoping new in V6)
- `presales_rep`, `telemarketing_rep`, `customer_recovery_rep`, `sales_rep` → `/dashboard` (team-filtered)
- `site_visit_coordinator` → `/dashboard/site-visits`
- `service_account` → `/api/*` only
- `channel_partner` → 401 in V6 (dormant)

---

## §3. The two flagship AI-native loops

Both loops start from a Voice IQ event after a call completes. Both write to the existing **agent approval queue** (D-322).

### §3.1 Brochure Agent loop (D-600)

```
   ┌─────────────────────────────────────────────────────────────┐
   │  PRESALES REP calls customer via Exotel adapter (D-609)     │
   └────────────┬────────────────────────────────────────────────┘
                │
                ▼ call.completed
   ┌─────────────────────────────────────────────────────────────┐
   │  Voice IQ ingests recording, runs analysis, POSTs to        │
   │  /api/events/inbox with event_kind = call.next_best_action  │
   │  payload: { kind: 'send_brochure', project: '<id>',         │
   │              criteria: { bhk: 3, budget: '1.5-2Cr' } }      │
   └────────────┬────────────────────────────────────────────────┘
                │
                ▼ inngest event "call.next_best_action" handler
   ┌─────────────────────────────────────────────────────────────┐
   │  Brochure Agent (T2)                                        │
   │  1. SELECT brochure FROM brochures WHERE org_id = ?         │
   │       AND project_id = ? AND metadata->'bhk' = '3' AND ...  │
   │  2. Anthropic call: draft WhatsApp message body using       │
   │     call transcript summary + lead name + brochure title    │
   │  3. INSERT INTO agent_approval_queue (channel='whatsapp',   │
   │     draft_body=<text>, attachments=[brochure_file_path],    │
   │     auto_send=<from agent_message_policies>)                │
   └────────────┬────────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  IF auto_send=true (per D-614 policy):                      │
   │    -> dispatch immediately via D-603 wired adapter          │
   │  IF auto_send=false:                                        │
   │    -> appears in /admin/agents/queue + presales rep         │
   │       gets a task notification (D-619)                      │
   │    -> rep approves -> D-603 dispatch -> activity logged     │
   └─────────────────────────────────────────────────────────────┘
```

### §3.2 Site Visit Booking Agent loop (D-601)

```
   ┌─────────────────────────────────────────────────────────────┐
   │  Voice IQ POSTs event_kind = call.next_best_action          │
   │  payload: { kind: 'book_site_visit',                        │
   │             project: '<id>',                                │
   │             preferred_date: '2026-05-20',                   │
   │             preferred_window: '11am-1pm' }                  │
   └────────────┬────────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Site Visit Agent (T2) creates a "pending booking" row in   │
   │  site_visits with status=draft + writes to agent_approval_  │
   │  queue with kind='site_visit_booking' + draft action card   │
   └────────────┬────────────────────────────────────────────────┘
                │
                ▼ Presales rep (or coordinator) opens the action card
   ┌─────────────────────────────────────────────────────────────┐
   │  UI form: enter pickup address (auto-pre-filled from lead   │
   │  custom field if present), confirm date/time window,        │
   │  driver name + phone + vehicle number + cab provider.       │
   │  (V6: manual entry. V6.x: Uber for Business / Ola Corporate │
   │  API auto-booking.)                                         │
   └────────────┬────────────────────────────────────────────────┘
                │
                ▼ Submit
   ┌─────────────────────────────────────────────────────────────┐
   │  1. UPDATE site_visits SET status=scheduled, cab_*,         │
   │      driver_*, vehicle_number, assigned_sales_rep_id =      │
   │      <looked up via D-608 project_sales_assignments>        │
   │  2. INSERT activity node ("site visit booked")              │
   │  3. Render WhatsApp template:                               │
   │       "Hi {name}, your site visit is confirmed for          │
   │        {date} at {time}. Cab {vehicle} (driver {driver},    │
   │        {phone}) will reach {pickup} by {pickup_time}.       │
   │        Looking forward to seeing you at {project}."         │
   │  4. Dispatch via D-603 adapter (WhatsApp)                   │
   │  5. Notify assigned_sales_rep_id (D-619)                    │
   │  6. Notify site_visit_coordinator                           │
   └─────────────────────────────────────────────────────────────┘
```

---

## §4. New Directives — full PRD entries

Each directive entry below has: **Purpose · User story · Scope (in/out) · Acceptance Criteria · Data Model · RBAC · Dependencies · Effort estimate.**

---

### D-600 · Brochure Agent

**Purpose:** When Voice IQ identifies a need to share project material, an AI agent picks the right brochure from the org's repository, drafts a customised WhatsApp message, and either auto-sends or queues for human approval.

**User story:** As a presales rep, after I finish a call where the customer asked about the project's 3BHK floor plan, I want the system to automatically queue a WhatsApp message with the right brochure attached so I can approve and send without searching.

**In scope:**
- Subscribe to Voice IQ event `call.next_best_action` with kind in `['send_brochure', 'send_floor_plan', 'send_price_sheet']`
- Match brochure by metadata: `project_id`, `bhk`, `budget_band`, `area_sqft_range`, `document_type`
- Anthropic call to draft message body using: call transcript summary, lead name, brochure title, project name
- Write to `agent_approval_queue` with `kind='brochure_send'`, attachments array containing brochure storage path
- Honor per-org `agent_message_policies` for auto-send vs approve
- Activity node written on send with full provenance

**Out of scope:**
- Brochure content generation (we send what was uploaded)
- Cross-org brochure sharing
- Versioning brochures (operator deletes + reuploads)

**Acceptance criteria:**
1. VIQ event `call.next_best_action` with `kind='send_brochure'`, project_id, and BHK criteria produces exactly one approval queue row within 30 sec.
2. If no matching brochure exists, queue row is created with `error='no_match'` and operator is notified.
3. If `agent_message_policies.kind='brochure_send'.mode='auto_send'`, the message dispatches without operator action.
4. The draft body contains the lead's first name, the brochure title, and a call-to-action — verified by AI eval suite (>=80% pass rate on 20 test transcripts).
5. Cross-org isolation: VIQ event for org A cannot access org B's brochures (verified by integration test).

**Data model:**
```sql
-- agent_approval_queue extended (existing table):
ALTER TABLE agent_approval_queue
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'follow_up',  -- 'follow_up' | 'brochure_send' | 'site_visit_booking'
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS error text;
```

**RBAC:**
- New permission: `brochures:view` (any rep can see what was sent)
- `brochures:upload` for `org_admin`, `workspace_admin`, `manager`
- Existing `agents:approve_T2` gates approval action

**Dependencies:** D-130 (VIQ payload), D-322 (approval queue), D-603 (adapter dispatch), D-607 (brochure repo), D-614 (policy)

**Effort:** 5–7 dev days

---

### D-601 · Site Visit Booking Agent

**Purpose:** When Voice IQ identifies a customer requesting a site visit, the system creates a draft booking, surfaces a one-click action form, books the cab (manual entry V6 → API V6.x), notifies the customer, and auto-assigns the sales rep stationed at that project.

**User story:** As a presales rep, when my customer asks to visit the project on Saturday afternoon, I want the system to surface a single form where I enter the cab details and address, click submit, and the customer instantly gets a WhatsApp confirmation while the sales rep at the project gets the assignment.

**In scope:**
- Subscribe to VIQ event `call.next_best_action` with `kind='book_site_visit'`
- Create `site_visits` row with `status='draft'`, prefill from lead custom fields (preferred_date, project)
- Render approval-queue action card: form fields for pickup address, time window, cab provider, driver name + phone, vehicle number
- On submit: transition status to `scheduled`, store cab details, look up `assigned_sales_rep_id` via D-608 mapping
- Render WhatsApp confirmation message to customer using template
- Send via D-603 adapter
- Notify assigned sales rep + site visit coordinator (D-619)
- Write activity nodes ("site visit booked", "customer notified", "sales rep assigned")

**Out of scope (V6):**
- Cab booking API integration (manual driver entry only)
- Calendar sync (Google Calendar two-way is a V6.x extension)
- Multi-leg trips (one pickup, one project)
- Driver-side tracking app

**Acceptance criteria:**
1. VIQ event triggers a site_visits draft row + an approval-queue action card within 30 sec.
2. Submitting the cab form transitions the visit to `scheduled` and dispatches the customer WhatsApp within 60 sec.
3. The WhatsApp template includes: lead first name, date, time window, vehicle number, driver name, driver phone, pickup location, project name.
4. The sales rep assigned matches the `project_sales_assignments` primary rep for that project (or fallback if primary unavailable).
5. If no project-sales assignment exists, the visit is created with `assigned_sales_rep_id=null` and the coordinator is notified to assign manually.

**Data model:**
```sql
-- site_visits (existing) extended:
ALTER TABLE site_visits
  ADD COLUMN cab_provider text,
  ADD COLUMN cab_booking_ref text,
  ADD COLUMN driver_name text,
  ADD COLUMN driver_phone text,
  ADD COLUMN vehicle_number text,
  ADD COLUMN pickup_address text,
  ADD COLUMN pickup_time timestamptz,
  ADD COLUMN coordinator_id uuid REFERENCES profiles(id);

-- project_sales_assignments (new, D-608)
CREATE TABLE project_sales_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL,  -- references nodes.id where node_type='project'
  sales_rep_id    uuid NOT NULL REFERENCES profiles(id),
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  UNIQUE (organization_id, project_id, sales_rep_id)
);
```

**RBAC:**
- `site_visits:create` for `presales_rep`, `manager`, `org_admin`
- `site_visits:assign` for `manager`, `site_visit_coordinator`, `org_admin`
- `site_visits:coordinate` for `site_visit_coordinator`, `org_admin`

**Dependencies:** D-130, D-602, D-603, D-608

**Effort:** 7–10 dev days

---

### D-602 · Site Visit Module

**Purpose:** A first-class Site Visits tab with list view, detail view, status workflow, coordinator dashboard, and a settable "I'll coordinate today's visits" role.

**User story:** As a site visit coordinator, I want a single page that shows me all upcoming site visits, with cab status, driver contact, and customer details — so I can call the driver if they're late and intervene before the customer complains.

**In scope:**
- Route `/dashboard/site-visits` with list + filters (today, upcoming, by status, by project, by coordinator, by sales rep)
- Detail page `/dashboard/site-visits/[id]` showing all metadata + activity history
- Status workflow: `draft → scheduled → confirmed → in_progress → completed → cancelled → no_show`
- Coordinator role with a "claim today's coordination" button (single coordinator per day)
- Day-bucket query by IST timezone with strict org isolation
- Site Visit calendar widget on `/admin` cockpit linked to this list

**Out of scope:**
- GPS check-in / map view (per PRD v3.0)
- Customer-facing "track my cab" link (V6.x)

**Acceptance criteria:**
1. `/dashboard/site-visits` renders with org-scoped RLS-protected results.
2. Status transitions audit-logged with provenance.
3. Coordinator claim is atomic — only one coordinator per (org, day).
4. Sales rep can see only the visits assigned to them; manager sees all in their team's projects; org_admin sees all.
5. Filtering by status + project + date returns within 500ms p95 on 1000-visit fixture.

**Data model:** see D-601 site_visits extension above + new:
```sql
CREATE TABLE site_visit_coordinator_claims (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  coordination_date date NOT NULL,
  coordinator_id uuid NOT NULL REFERENCES profiles(id),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, coordination_date)
);
```

**RBAC:**
- `site_visits:view` — all rep roles + manager + org_admin
- `site_visits:coordinate` — `site_visit_coordinator` + org_admin

**Dependencies:** D-012 (existing site-visit foundation), D-222 (calendar widget)

**Effort:** 5–7 dev days

---

### D-603 · Wire Integration Adapters into Agent Dispatch (THE BIG ONE)

**Purpose:** Replace the hardcoded `pickProvider() → 'mock'` in `lib/agents/follow-up/dispatch.ts` with real per-org adapter instantiation. Without this, V6 stays mockware.

**User story:** As an org admin, when I enter our Exotel + Resend + MSG91 + Gupshup credentials in /admin/integrations, I expect actual outbound calls / emails / SMS / WhatsApp to leave the system when our team approves agent drafts.

**In scope:**
- Rewrite `pickProvider(channel, org_id)` to read `org_{channel}_config` row, decrypt credentials via `decryptJson`, instantiate the real adapter via existing `instantiate{Channel}Adapter(row)`
- Per-channel fallback: if org has no config, refuse dispatch with `reason='not_configured'`, log to audit, surface in approval queue UI as "configure integration to send"
- Channel coverage: email (Resend), SMS (MSG91), WhatsApp (Gupshup OR Cloud API per org choice), telephony outbound (Exotel — wired separately in D-609 for canvas clicks)
- Retry semantics preserved (D-415 retry contract intact)
- Inngest delivery worker (D-311) untouched

**Out of scope:**
- New providers (Postmark, Servetel, etc. all remain "coming soon")
- Provider failover (if Resend is down, the send fails — no auto-flip to a fallback)

**Acceptance criteria:**
1. End-to-end E2E test: provision org → org admin enters Resend test API key → presales rep approves a follow-up draft → real email arrives at the test mailbox within 30 sec.
2. Same for MSG91 SMS (DLT-compliant template).
3. Same for Gupshup or Cloud API WhatsApp.
4. If credentials are absent, approval action surfaces clear UI: "Configure your email integration to send this draft. Org admins can do this at /admin/integrations/email."
5. Cross-tenant isolation: org A's adapter never receives org B's payload (verified by integration test).
6. Existing 27 follow-up dispatch unit tests pass + 12 new tests covering real-adapter selection paths.

**Data model:** no new tables. Uses existing `org_email_config`, `org_sms_config`, `org_whatsapp_endpoints`, `org_telephony_config`.

**RBAC:** existing `agents:approve_T2` gates approval; org admin permissions gate credential entry.

**Dependencies:** D-432, D-433, D-434, D-435, D-439

**Effort:** 3–5 dev days

**Priority:** P1 — this directive alone is what blocks the product from being "really usable."

---

### D-604 · Marketing Intelligence Hub (MIH) Inbound API

**Purpose:** A single canonical endpoint for the MIH sister product to push curated, deduplicated leads into the CRM with full provenance.

**User story:** As MIH (sister product), when I dedupe and curate a Meta Lead Ads / 99acres / JustDial lead, I want to POST it to the CRM with a single API call and get back a CRM lead ID + status — without the CRM caring about the original source connector.

**In scope:**
- `POST /api/sister/v1/leads` (Bearer auth via D-440 token, scoped to `product_kind='marketing_intelligence_hub'`)
- Request body (Zod-validated):
  ```typescript
  {
    organization_id: string (uuid),
    external_id: string,                     // MIH's stable id for dedup
    name: string,
    phone_e164: string,
    email?: string,
    source: string,                          // e.g. 'meta_lead_ads', '99acres'
    source_campaign_id?: string,
    source_ad_id?: string,
    source_channel: 'paid_social' | 'paid_search' | 'aggregator' | 'organic_web' | 'walk_in' | 'cp',
    source_received_at: string (ISO),
    preference: {
      bhk?: number,
      budget_band?: string,
      project_interest?: string,
      area_sqft_min?: number,
      area_sqft_max?: number,
      city?: string,
      locality?: string,
    },
    age?: number,
    gender?: string,
    occupation?: string,
    notes?: string,
    raw_payload: object                      // archived for audit
  }
  ```
- Response: `201 { lead_id, status: 'created' | 'duplicate_merged', allocated_to_user_id }`
- Dedup: lookup by `external_id` first, then by `phone_e164` within org → merge if found (union new fields, keep original `created_at`)
- On create, emit `lead.created` Inngest event → triggers D-009 enrichment + D-610 allocation
- All payloads logged to `event_inbox_log` with `source_product='marketing_intelligence_hub'`
- Per-org rate limit: 100 leads/sec via KV bucket
- Idempotent on `external_id` retries

**Out of scope:**
- Source-specific connectors (those live in MIH)
- Lead scoring (Lead Enrichment Agent runs separately)
- CSV bulk via this endpoint (use /api/leads/ingest webform if needed)

**Acceptance criteria:**
1. Valid Bearer token + valid payload → 201 with lead_id within 200ms p95.
2. Duplicate `external_id` returns the original lead_id with `status='duplicate_merged'`.
3. Duplicate `phone_e164` within same org also merges.
4. Invalid token → 401.
5. Wrong `product_kind` token (e.g. PSCRM token) → 403.
6. Schema violation → 400 with field-level error.
7. Rate limit exceeded → 429 with Retry-After.
8. Cross-tenant: token for org A can never create a lead in org B.

**Data model:**
```sql
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS source_external_id text,           -- MIH's id
  ADD COLUMN IF NOT EXISTS source_payload jsonb;              -- raw archive

CREATE INDEX IF NOT EXISTS nodes_source_external_id_idx
  ON nodes (organization_id, source_external_id)
  WHERE deleted_at IS NULL AND node_type = 'lead';
```

**RBAC:** service_account-only path.

**Dependencies:** D-440 (sister tokens), D-009 (enrichment), D-610 (allocation)

**Effort:** 2–3 dev days

---

### D-605 · Command Center home — Real Data

**Purpose:** Replace the hardcoded `/dashboard` mockup with real org-scoped data so the first page a user sees reflects reality.

**User story:** As a presales rep, when I log in, I want to see my real lead count, my real upcoming site visits, and my real pending agent approvals — not a placeholder showing "Rohit Menon → +91 98••• 4421".

**In scope:**
- Replace `KpiTiles` static array with real query: active_leads (where `state in ('new', 'contacted', 'qualified')` and assignee is current user), hot_pipeline (intent_score >= 70), avg_intent (mean of intent_score on last 30d), mtd_closed
- Replace `PulseFeed` with realtime activity feed (last 20 activities in user's view) — Postgres realtime subscription
- Replace `LeadHeatmap` with real per-day lead-volume + intent-density chart for current month
- Replace `AgenticState` with real agent run summary (running, queued, sent today, blocked) from `agent_approval_queue`
- Replace `StateMachineCanvas` with real lead-state distribution
- Replace `HotLeadsStrip` with real top-5-by-intent-score in user's view
- All components RLS-scoped to caller's role + workspace

**Out of scope:**
- Customizable widgets on Command Center home (use `/admin/dashboards` for that)
- Cross-team aggregation for non-manager roles

**Acceptance criteria:**
1. Page renders org-scoped real data within 1.5s p95.
2. Sales rep sees only leads/activities in their assignment.
3. Manager sees full team rollup.
4. Org admin sees full org rollup.
5. Realtime pulse updates within 2 sec of an upstream event.
6. New empty-state copy for orgs with no data: "No leads yet — connect MIH or use the universal webform endpoint."

**Data model:** no new tables.

**RBAC:** uses existing perms.

**Dependencies:** D-009, D-410, existing realtime publication

**Effort:** 3–5 dev days

---

### D-606 · Super Admin V6 Capabilities

**Purpose:** Give super admin operational tooling to run the platform at scale — impersonation, action logs, defect tracking, per-org feature flags.

**User story:** As super admin, when a builder complains "the brochure agent didn't send", I want to impersonate their org, replay the call event, view their action log, file a defect, and adjust their feature flags — all from `/platform`.

**In scope:**
- **Impersonation:** `/platform/organizations/[id]/impersonate` button. Sets session JWT to act as the org's org_admin. Banner across all impersonated pages: "IMPERSONATING <org name> — exit". Every action audit-logged with both super_admin_id and acting-org. Auto-exit after 30 min inactivity.
- **User action log viewer:** `/platform/audit?org=<id>&user=<id>&from=<date>` — search/filter audit_log + api_audit_log across orgs.
- **Defect tracking module:** `/platform/defects` — new table `platform_defects` (id, org_id, severity, title, description, status, assigned_to, related_audit_ids[], created_at, resolved_at). Used for tracking root cause of incidents.
- **Per-org feature flag matrix:** `/platform/organizations/[id]/features` — toggle which V6 features are enabled per org (brochure agent on/off, site visit agent on/off, custom dashboards on/off, etc.). Stored in `organizations.feature_flags jsonb`.
- **Per-org subscription tier override:** ability to set custom plan beyond Stripe-driven tier.

**Out of scope:**
- Full SaaS billing portal (Stripe portal does it)
- A separate ticketing system (use existing /platform/tickets)

**Acceptance criteria:**
1. Super admin clicks "impersonate" → lands on org's `/admin` → banner visible → actions audit-logged with provenance — verified by integration test.
2. Exit impersonation returns to `/platform/organizations/[id]`.
3. Defect tracking module supports create, edit, resolve, link to audit rows.
4. Feature flag toggle hides/shows surfaces in the target org's UI within 60 sec.
5. Cross-tenant: super admin cannot accidentally write to a non-impersonated org via the impersonation channel.

**Data model:**
```sql
CREATE TABLE super_admin_impersonation_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id     uuid NOT NULL REFERENCES profiles(id),
  organization_id    uuid NOT NULL REFERENCES organizations(id),
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  reason             text NOT NULL,
  CHECK (length(reason) >= 10)
);

CREATE TABLE platform_defects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  severity        text NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  title           text NOT NULL,
  description     text NOT NULL,
  status          text NOT NULL CHECK (status IN ('open','triaged','in_progress','resolved','wont_fix')),
  assigned_to     uuid REFERENCES profiles(id),
  related_audit_ids text[] NOT NULL DEFAULT '{}',
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}';
```

**RBAC:** `platform:manage` required for all D-606 actions.

**Dependencies:** D-004, D-202, D-302

**Effort:** 5–7 dev days

---

### D-607 · Brochure Repository

**Purpose:** Org admin uploads brochures with structured metadata so the Brochure Agent (D-600) can pick the right one.

**User story:** As an org admin, I want to upload our 3BHK floor plan PDF, tag it with `project=Prestige Lakeside, bhk=3, budget_band=1.5-2Cr, document_type=floor_plan`, so the AI knows to pick it when a customer asks for that material.

**In scope:**
- `/admin/brochures` UI: list + upload form + metadata editor + delete
- Upload to Supabase Storage (`brochures/{org_id}/{uuid}/{filename}`)
- Metadata schema: `project_id`, `document_type` (`brochure`, `floor_plan`, `price_sheet`, `legal_doc`, `amenity_doc`), `bhk` (1–5), `budget_band` (string from enum), `area_sqft_min`, `area_sqft_max`, `tags[]`, `description`
- Per-org RLS on file references; storage path scoped per org
- File size cap: 25MB per file
- Allowed types: PDF, JPG, PNG
- Signed URLs for read access (expire in 1h)

**Out of scope:**
- Brochure templating / content generation
- AI-generated metadata extraction (operator enters manually V6; auto-extract V6.x)
- Versioning (operator deletes + reuploads)

**Acceptance criteria:**
1. Org admin uploads a PDF → metadata form pre-populated with filename → saves with validation.
2. Brochure agent queries `brochures` by org + project + bhk + budget_band → returns matching rows.
3. Signed URL retrieval works for org members; cross-org access blocked.
4. Delete soft-deletes + invalidates signed URL.

**Data model:**
```sql
CREATE TABLE brochures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid,        -- references nodes.id where node_type='project'
  document_type   text NOT NULL CHECK (document_type IN ('brochure','floor_plan','price_sheet','legal_doc','amenity_doc')),
  title           text NOT NULL,
  file_path       text NOT NULL,         -- Supabase Storage key
  file_size_bytes bigint NOT NULL,
  mime_type       text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}',   -- bhk, budget_band, area_sqft, tags, description
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid NOT NULL,
  deleted_at      timestamptz
);

CREATE INDEX brochures_org_project_idx ON brochures (organization_id, project_id) WHERE deleted_at IS NULL;
```

**RBAC:**
- `brochures:view` — all rep + manager + admin
- `brochures:upload` — manager + workspace_admin + org_admin
- `brochures:delete` — workspace_admin + org_admin

**Dependencies:** D-020 (custom fields engine reused for metadata), Supabase Storage

**Effort:** 3–5 dev days

---

### D-608 · Project ↔ Sales-Person Mapping

**Purpose:** Manager configures which sales rep is the primary contact at which project, so D-601 site-visit agent can auto-assign.

**User story:** As a manager, I want to set Anjali as the primary sales rep for the Bengaluru-Whitefield project so that when a customer books a site visit there, she gets the assignment automatically.

**In scope:**
- `/admin/projects/[id]/sales-team` UI (or under manager dashboard)
- Add / remove / mark-primary sales rep per project
- Multiple reps allowed per project; exactly one primary
- Fallback rule: if primary is on leave (configurable status), next non-primary rep gets assigned

**Out of scope:**
- Round-robin within project
- Skill-based routing
- Calendar-aware assignment (V6.x)

**Acceptance criteria:**
1. Manager opens project → adds 3 reps → marks one primary → saves.
2. D-601 lookup returns primary rep first; if primary has `on_leave=true` (profile column), returns next rep.
3. RLS scopes assignments to org.

**Data model:** see D-601 above. Also:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS on_leave boolean NOT NULL DEFAULT false;
```

**RBAC:**
- `projects:assign_sales` — manager + org_admin

**Dependencies:** D-018, D-601

**Effort:** 2–3 dev days

---

### D-609 · Click-to-Call on Canvas

**Purpose:** Wire the existing Exotel adapter to lead/contact/deal canvas so reps can click a phone number and place a call.

**User story:** As a presales rep, when I open a lead canvas with a phone number, I want a "Call" button that initiates an Exotel click-to-call to the customer.

**In scope:**
- Phone-number field on lead/contact/deal canvas renders a click-to-call button (requires `calls:listen` perm)
- Button POSTs to `/api/calls/initiate` with `{lead_id}` → server calls `ExotelTelephonyProvider.outboundClickToCall(rep_phone, customer_phone)`
- Call status updates write activity nodes as `call.completed` arrives from Exotel call-status webhook
- Reps without a `phone` set on their profile see a configuration prompt

**Out of scope:**
- Soft phone in-browser (Twilio Voice JS, etc.) — V6.x
- Call hold/transfer/conference
- Mobile-app integration

**Acceptance criteria:**
1. Click "Call" on lead canvas → Exotel API receives the connect request → both phones ring → activity node `call.initiated` written within 5 sec.
2. Call-status webhook updates activity node with disposition (`connected`, `no_answer`, etc.) within 10 sec of call end.
3. Cross-tenant: click-to-call from org A cannot use org B's Exotel credentials.
4. Without `calls:listen` perm, button is hidden.

**Data model:** no new tables.

**RBAC:** `calls:listen` (existing).

**Dependencies:** D-433, D-603

**Effort:** 2–3 dev days

---

### D-610 · Pre-sales Auto-Allocation Engine

**Purpose:** Manager configures rules for how incoming MIH leads route to presales reps (e.g., by source, by city, by budget band, round-robin within a team).

**User story:** As a manager, I want all Meta Lead Ads leads with budget >1Cr to round-robin among my 3 senior presales reps; all aggregator leads (99acres, MagicBricks) go to the junior team in round-robin.

**In scope:**
- `/admin/allocation-rules` UI: list + create rule
- Rule fields: priority (lower number wins), conditions (JSONB — `source`, `source_channel`, `budget_band_in[]`, `city_in[]`, `bhk_in[]`), target (team_id OR user_id OR round-robin-within-team)
- On `lead.created` event (Inngest), engine evaluates rules in priority order, picks first match
- Round-robin state stored in `lead_allocation_state` for fair distribution
- Fallback: if no rule matches, lead goes to default unassigned queue surfaced on `/dashboard/leads/unassigned`
- Audit row written on every allocation decision

**Out of scope:**
- Skill-based routing (V6.x)
- Lead-score-aware routing (separate from D-009 enrichment for now)
- Auto-reassignment if rep is on leave (V6.x — manual reassign for now)

**Acceptance criteria:**
1. Manager creates rule "Meta + budget>1Cr → round-robin among senior team" → MIH POSTs 3 matching leads → each goes to a different rep in the senior team.
2. Audit row written per allocation: `{rule_id, lead_id, target_user_id, evaluated_at}`.
3. No matching rule → lead goes to unassigned queue.
4. Cross-tenant: rules of org A never apply to org B leads.
5. Disabling a rule via `active=false` prevents further matches.

**Data model:**
```sql
CREATE TABLE lead_allocation_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  priority        int NOT NULL,
  conditions      jsonb NOT NULL,
  target_kind     text NOT NULL CHECK (target_kind IN ('user','team_round_robin','team_first_available')),
  target_user_id  uuid REFERENCES profiles(id),
  target_team_id  uuid REFERENCES teams(id),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  UNIQUE (organization_id, priority)
);

CREATE TABLE lead_allocation_state (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  last_assigned_user_id uuid REFERENCES profiles(id),
  last_assigned_at timestamptz,
  PRIMARY KEY (organization_id, team_id)
);
```

**RBAC:**
- `allocation_rules:manage` — manager + org_admin

**Dependencies:** D-007 (lead lifecycle), D-018 (users), team table from D-001

**Effort:** 3–5 dev days

---

### D-611 · AI Workflow Builder (N8N-style)

**Purpose:** Replace the current form-based "Directives" UI with a visual DAG builder where org admins drag-drop triggers + actions, test with sample payloads, and publish.

**User story:** As an org admin, I want to drag a "WhatsApp inbound" trigger onto a canvas, connect it to a "Run Lead Enrichment" action, then connect that to a "Send brochure if intent>70" action, test with a sample payload that fires through, and click Publish.

**In scope:**
- `/admin/ai-workflows` (renamed from `/admin/directives`) — list + create + edit
- Visual DAG editor using React Flow (or similar lib)
- Trigger nodes: `whatsapp.inbound`, `email.inbound`, `lead.created`, `call.next_best_action`, `lead.state_changed`, `manual.button_click`, schedule (cron)
- Action nodes: `send_template_message`, `update_lead_field`, `assign_to_user`, `create_task`, `send_brochure` (D-600), `book_site_visit` (D-601), `call_ai_gateway` (custom prompt → result)
- Wires between nodes with optional conditions (if/else on the output of the prior action)
- "Test" button — operator provides a sample payload, system runs the workflow in a sandbox (no real sends, no DB writes), shows the trace per node
- "Publish" button — promotes the draft to live, write to `directives` table with new `version` + `compiled_dag jsonb`
- Versioning: editing a published workflow creates a new draft, can promote or revert
- "Test before publish" enforces test passed before allowing publish

**Out of scope:**
- User-defined custom action types (V6.x — stick to built-in node catalog)
- Branching beyond if/else (no merge/join logic in V6)
- Workflow imports/exports
- Marketplace of workflow templates

**Acceptance criteria:**
1. Org admin opens editor → drags trigger + 2 actions → connects them → saves → renders correctly on reopen.
2. Test mode runs through nodes with sample payload, shows per-node input/output, no real side effects.
3. Publish blocks if no successful test run on current version.
4. Live workflow fires for real on next matching event.
5. Editing a published workflow creates v2 in draft state; v1 stays live until v2 is published.
6. Revert action restores prior version live.

**Data model:**
```sql
ALTER TABLE directives
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES directives(id),
  ADD COLUMN IF NOT EXISTS compiled_dag jsonb,
  ADD COLUMN IF NOT EXISTS test_payloads jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_test_passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN ('draft','testing','live','archived'));
```

**RBAC:** `directives:author` for create/edit, `directives:approve` for publish.

**Dependencies:** D-011 (engine), D-017 (existing UI)

**Effort:** 10–15 dev days — the biggest investment in V6.

---

### D-612 · Team-Scoped Dashboards

**Purpose:** Manager builds a dashboard and publishes it to a specific team. Team members see only what's published to them.

**User story:** As a presales manager, I want to build a "Today's hot leads + my team's followups" dashboard, publish it to my presales team only, so when my reps log in they see it as their primary dashboard.

**In scope:**
- Existing `/admin/dashboards` extended with "Publish to team" action
- New table `team_dashboard_assignments` links dashboards to teams
- Dashboard list page filters: `mine`, `team`, `org-wide`
- On team-member login, their default dashboard is the team-published one (if any)
- Manager can revoke publication
- Edits to a published dashboard ask "create new version or update live?"

**Out of scope:**
- Per-user dashboard layouts (team-scoped only V6)
- Conditional widgets based on user role (use widget perms instead)

**Acceptance criteria:**
1. Manager creates dashboard → publishes to presales team → presales reps see it as their default on next login.
2. Sales reps (not in presales team) don't see it in their list.
3. Revoking publication immediately removes from team members' views.

**Data model:**
```sql
CREATE TABLE team_dashboard_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid NOT NULL REFERENCES dashboard_definitions(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  is_default    boolean NOT NULL DEFAULT false,
  published_at  timestamptz NOT NULL DEFAULT now(),
  published_by  uuid NOT NULL,
  UNIQUE (dashboard_id, team_id)
);
```

**RBAC:** `dashboards:customize` (existing) + new `dashboards:publish_to_team`.

**Dependencies:** D-021

**Effort:** 5–7 dev days

---

### D-613 · App Access Sidebar Swap

**Purpose:** Replace the "Voice IQ" sidebar entry with "App Access" pointing to `/admin/apps`.

**User story:** As an org admin, the sidebar should reflect that we're a multi-app platform, not just a Voice IQ surface. App Access shows which sister apps are connected and their status.

**In scope:**
- `CommandCenterSidebar.PRIMARY_NAV`: rename entry from "Voice IQ" / point to `/admin/integrations/voice-iq` → "App Access" / point to `/admin/apps`
- `/admin/apps` page already exists (D-501 ported AppAccessCard) — verify it shows real connection status for CRM, Voice IQ, MIH, and "coming soon" for others

**Out of scope:**
- New sister-app onboarding UI (separate directive)

**Acceptance criteria:**
1. Sidebar entry renamed.
2. Click lands on `/admin/apps`.
3. Voice IQ deep-link still accessible via `/admin/integrations/voice-iq` (just not in sidebar).

**Effort:** 0.5–1 day

---

### D-614 · Predefined Message Templates

**Purpose:** Org admin chooses, per agent kind (brochure_send, site_visit_booking, follow_up), whether to auto-send or require approval.

**User story:** As an org admin, I want brochure messages to auto-send (they're low-risk) but site-visit confirmations to require approval (they need cab details verified first).

**In scope:**
- New table `agent_message_policies` (org_id, agent_kind, mode)
- `/admin/agents/policies` UI to configure
- Brochure Agent + Site Visit Agent + Follow-up Agent check policy before queuing vs sending

**Out of scope:**
- Per-customer overrides
- Time-window policies (e.g., "auto-send during business hours only")

**Acceptance criteria:**
1. Org admin sets brochure_send to `auto_send` → next brochure agent run dispatches immediately without queuing.
2. Default for new orgs: all agent kinds = `require_approval`.

**Data model:**
```sql
CREATE TABLE agent_message_policies (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_kind      text NOT NULL,                    -- 'brochure_send', 'site_visit_booking', 'follow_up', ...
  mode            text NOT NULL CHECK (mode IN ('auto_send','require_approval')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  PRIMARY KEY (organization_id, agent_kind)
);
```

**Effort:** 2–3 dev days

---

### D-615 · AI Agent Approval Workflow (Manager → Org Admin)

**Purpose:** Managers can author new AI workflows; org admins approve before they go live. Creates accountability + safety.

**User story:** As a manager, I want to author a workflow that sends a custom WhatsApp to every lead with intent > 80, but I need my org admin to approve it before it auto-fires across the team.

**In scope:**
- Workflows authored by `manager` enter `lifecycle_status='pending_approval'`
- Org admins see a queue at `/admin/ai-workflows/pending` with Approve / Reject + reason
- Approval moves workflow to `lifecycle_status='live'`
- Rejection moves to `archived` with reason
- Both actions audit-logged

**Acceptance criteria:**
1. Manager publishes → workflow lifecycle = `pending_approval`, not live.
2. Org admin sees in queue → approves → live.
3. Rejection requires reason >=10 chars.

**Effort:** 3–5 dev days

---

### D-616 · Customer Recovery Team

**Purpose:** New role + auto-routing of leads in terminal/stale states to a recovery queue.

**User story:** As a customer recovery rep, I want a dedicated queue of leads that went cold (no contact 14+ days) or terminal (state='lost') that I can re-engage.

**In scope:**
- New role `customer_recovery_rep`
- Inngest cron: every 6h sweep leads where `state in ('lost', 'stale')` AND `last_contact_at < now() - interval '14 days'` → add to `customer_recovery_queue`
- `/dashboard/recovery` page for the role
- Recovery-specific dashboard widgets

**Acceptance criteria:**
1. Role landing on `/dashboard/recovery`.
2. Queue populated by cron.
3. Recovery reps can take ownership, re-engage, mark as resolved.

**Effort:** 3–5 dev days

---

### D-617 · Cmd+K Shortcut Completion

**Purpose:** Replace the 12 placeholder Cmd+K actions with real filtered list pages OR strip them.

**Decision tree:**
- If the placeholder maps to an existing list (hot-leads, new-leads, contacted-leads, qualified-leads, terminal-leads) → build a filtered URL on `/dashboard/leads?view=<canned>`. **Build, don't strip.**
- If the placeholder is for site visits (site-visits-today) → use D-602's filter URL. **Build.**
- If the placeholder is for entity-by-name lookup (open-deal, open-contact) → these already work via lookup-prefix mode. **Verify, don't touch.**
- If the placeholder is for source-specific lead filtering (leads-magicbricks, leads-99acres, leads-walkin) → source provenance from D-604 makes this viable. **Build.**
- If the placeholder is for feedback ("send-feedback") → real route to `/dashboard/settings/feedback` form. **Build.**

**Acceptance criteria:** all 12 Cmd+K entries either land on a real working page or are removed from the catalog.

**Effort:** 5–7 dev days

---

### D-618 · Realtime Updates Across Lists

**Purpose:** When a teammate updates a lead, dashboards/lists reflect the change without refresh.

**In scope:** Postgres realtime subscriptions on list pages (leads, deals, contacts, site-visits) + dashboards.

**Out of scope:** Realtime on canvas (already exists).

**Effort:** 3–5 dev days

---

### D-619 · Notifications System

**Purpose:** In-app bell, email digests, and WhatsApp pings for important events (new lead assigned, approval queue item, site-visit reminder).

**In scope:**
- New `notifications` table
- Bell icon in topbar with unread count
- Per-user preferences in `profiles.notification_prefs` (already exists, extend)
- Email digest cron (daily)
- WhatsApp pings via D-603 adapter

**Effort:** 5–7 dev days

---

### D-620 · Unified Contact Timeline

**Purpose:** Contact canvas shows all activities (calls, messages, site visits, follow-ups) across all leads/deals associated with that contact.

**Effort:** 3–5 dev days

---

### D-621 · Mobile-Responsive Admin + Dashboard

**Purpose:** Sales reps in the field on mobile need usable surfaces.

**In scope:** Tailwind responsive pass on lead canvas, deal canvas, site visits list, contact list, command center home.

**Out of scope:** Native app, admin surfaces (admin can stay desktop-only).

**Effort:** 5–10 dev days

---

## §5. Acceptance gates (mirrors §3 of Document 1)

Each phase has a gate. Gates are go/no-go for the next phase.

| Gate | Phase | Trigger |
|---|---|---|
| Gate 0 | Stabilization complete | All Phase-0 removals merged + clean build + V5 tests pass minus removed |
| Gate 1 | Core comms live | D-603 + D-604 + D-605 + D-610 + D-602 + D-608 + D-617 acceptance criteria all green |
| Gate 2 | AI agents live | D-600 + D-601 + D-607 + D-609 + D-614 + D-615 acceptance criteria all green |
| Gate 3 | Manager UX shipped | D-611 + D-612 + D-606 + D-616 acceptance criteria all green |
| Gate 4 | Polish | D-618 + D-619 + D-620 + D-621 acceptance criteria all green |
| Gate 5 | V6.0 GA | Pen-test pass + RLS audit 100% + first pilot signed off |

---

## §6. Compliance / Constitution alignment

V6 doesn't change anything in Constitution v2.0. Required alignment points:

- **Multi-tenancy:** every new table has `organization_id` + RLS policy + cross-tenant test.
- **Audit:** every state-changing action writes to `audit_log` with provenance.
- **RBAC:** every new permission added to the literal enum in `lib/auth/rbac.ts` with explicit role assignments.
- **Custom fields:** any field rep-defined is via D-020, not a new schema column.
- **AI tier ceiling:** no V6 agent exceeds T3 — all dispatches require operator approval unless explicitly auto-send-policied (D-614).
- **Secrets:** all integration credentials encrypted at rest via existing `encryptJson` + `INTEGRATION_ENCRYPTION_KEY`.

---

## §7. Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | D-603 wiring breaks existing follow-up dispatch in subtle ways | Extensive parallel-shadow testing in Phase 1 — log both mock and real adapter responses for 48h before flipping live |
| 2 | D-611 N8N-style builder scope creep | Hard cap on built-in node catalog (8 triggers + 12 actions). No custom node types in V6. |
| 3 | D-601 cab booking is operator-manual → operator burden | Track cab booking time in audit; if median >5 min/booking, prioritize Uber for Business API in V6.x |
| 4 | MIH inbound API contract changes mid-build | Lock contract via baseline file (`docs/baselines/122-mih-inbound-contract.md`) and require sign-off before D-604 starts |
| 5 | Removing inventory module breaks something the team forgot is connected | Phase 0 includes a "find all references" sweep with grep + test run before committing each removal |
| 6 | Super admin impersonation introduces a privilege escalation path | All impersonation actions audit-logged with both super_admin_id and acting_org_id; pen-test specifically targets this surface |

---

## §8. Effort summary

| Phase | Directives | Total dev days (low–high) |
|---|---|---|
| Phase 0 — Stabilization | removals + 8 cleanup items | 6–8 days |
| Phase 1 — Core comms | D-603, D-604, D-610, D-608, D-602, D-605, D-617 | 23–35 days |
| Phase 2 — AI behaviors | D-607, D-600, D-609, D-601, D-614, D-615 | 22–33 days |
| Phase 3 — Manager UX | D-611, D-612, D-616, D-606 | 23–32 days |
| Phase 4 — Polish | D-618, D-619, D-620, D-621 | 16–27 days |
| Phase 5 — GA hardening | RLS audit, pen-test prep, acceptance suite | 6–10 days |
| **Total V6** | | **96–145 dev days** (≈ 4.5–7 months for one full-time engineer; ≈ 2.5–3.5 months for two; ≈ 1.5–2.5 months for three) |

---

## §9. What changes in `/docs/`

After Phase 0 lands:

- `docs/PRD-v3.0.md` → archive (still referenced as V0–V5 source of truth)
- `docs/PRD-v6.0.md` → **this document**
- `docs/V6_STATUS.md` → new tracking doc (mirror of V5_STATUS.md format)
- `docs/plans/v6-plan-v1.md` → derived from this PRD + Document 1
- `docs/baselines/122-mih-inbound-contract.md` → new baseline locking D-604 contract
- `docs/runbooks/v6-stabilization-removals.md` → step-by-step removal procedure for Phase 0
- `docs/runbooks/v6-pilot-onboarding.md` → updated pilot flow
- `memory/per_org_integration_model.md` → unchanged
- `directives/600-brochure-agent.md` ... `directives/621-mobile-responsive.md` → individual directive specs (this PRD distills them; each gets its own file when entering Plan Mode)

---

## §10. Pilot acceptance scenario (end-to-end)

This is the test of V6 readiness — if a pilot customer can run this scenario from end to end with no engineer in the loop, V6 ships.

```
1. Super admin provisions "Demo Builders Pvt Ltd" org with starter plan.
2. Org admin signs in, completes onboarding:
   - Sets RERA + GSTIN
   - Adds 3 users (1 manager, 2 presales reps, 1 sales rep, 1 site visit coordinator)
   - Connects Resend + MSG91 + Exotel + WhatsApp (Gupshup)
   - Uploads 2 brochures (3BHK floor plan + price sheet) tagged to "Demo Project A"
3. Org admin grants MIH a sister-product token.
4. Manager configures:
   - Allocation rule: "any lead from MIH → round-robin among presales reps"
   - Project-sales mapping: "Demo Project A → Sales Rep R for primary"
   - Brochure agent: auto_send mode
5. MIH POSTs a curated lead (name, phone, source=meta_lead_ads, BHK=3, budget=1.5-2Cr, project_interest=Demo Project A).
6. CRM responds 201 + lead allocated to Presales Rep P within 5 sec.
7. Presales Rep P opens lead canvas, clicks "Call" → Exotel rings P's phone + customer's phone simultaneously.
8. Call completes; Voice IQ posts call.next_best_action with kind=send_brochure (project=Demo A, bhk=3, budget=1.5-2Cr).
9. Brochure Agent picks the 3BHK floor plan + drafts WhatsApp body with lead's first name + project name.
10. Auto-send policy is on → WhatsApp delivers to customer within 30 sec.
11. Customer replies on WhatsApp asking for site visit Saturday afternoon.
12. Voice IQ (or WhatsApp inbound handler) posts call.next_best_action with kind=book_site_visit.
13. Approval queue surfaces a "Book Site Visit" action card for Presales Rep P.
14. P fills cab details (driver name, phone, vehicle, pickup address, time) and submits.
15. Site visit transitions to scheduled; cab WhatsApp message sent to customer with all details.
16. Sales Rep R (primary for Demo Project A) gets notified of the upcoming visit.
17. Site Visit Coordinator sees the visit in /dashboard/site-visits with status "scheduled".
18. End of pilot scenario.
```

If every step above works with zero engineer involvement, V6 is GA-ready. The pilot scenario is the V6 acceptance Playwright test.

---

**End of Document 2.**
