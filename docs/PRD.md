# Builtrix AI-Native CRM — Consolidated PRD v2.0

| Field | Value |
|---|---|
| **Product** | Builtrix CRM — Salesforce-depth, AI-native sales workforce for Indian real-estate |
| **Type** | Multi-tenant SaaS |
| **Owner** | Raghava Sreeram · Builtrix Labs Pvt Ltd |
| **Author** | Jarvis (consolidated from PRD v1 [Salesforce-customizable] + AI-Native PRD v1 [Intelligent Canvas]) |
| **Version** | 2.0 (consolidated, supersedes both v1 PRDs) |
| **Status** | Draft — pending V5 Gate 2 (Plan Mode) review |
| **Stack OS** | Vibe Coding OS V5 |
| **Constitution** | `Builtrix-CRM-Constitution-v2.0` (ratified separately at `memory/constitution.md`) |
| **Path in repo** | `docs/PRD.md` (reference document; not consumed by V5 hooks) |
| **Last updated** | May 6, 2026 |

---

## 0. Why This PRD Exists (consolidation logic)

You wrote two PRDs at different abstraction layers. They conflicted in one important place. This PRD picks the trade-off explicitly:

| Question | PRD v1 (Salesforce-customizable) | PRD v2 (AI-Native Canvas) | Consolidated v2.0 (this doc) |
|---|---|---|---|
| Primary UX paradigm | Tables + forms + tabs (Salesforce-style) | Intelligent Canvas (no tabs) | **Canvas wins** — sales reps reject form-heavy CRMs |
| Custom fields, custom views, custom dashboards in V1? | Yes, all in V1 | No, deferred to V2 | **Yes — keep V1's depth** for Salesforce-level customization |
| Custom entities (L3) | Defer post-V1 | Defer to V2 | **Defer post-V1** (both PRDs agree) |
| Data model | Per-entity tables (`leads`, `deals`...) | Single `nodes` table + graph | **Graph** wins — easier semantic search, cleaner Canvas |
| RBAC depth | 3-layer override engine + plan tiers | Same constitutional model | **Same** — port from PRD v1 |
| Onboarding | 8-step wizard | <30min onboarding goal | **8-step wizard, <30min target** — both retained |
| Workflow engine | If-this-then-that workflows | DOE directive engine | **DOE wins** — directive paradigm scales better |
| Agent system | Tier T0–T4 ceilings | Tier T0–T4 ceilings | **Same** — both PRDs agree |
| MIH module | Bolted-on inside CRM | Separate product (event bus) | **Separate** — MIH is its own repo |
| Cmd+K NL command bar | Not specified | Yes, bounded V1 → free V2 | **Yes** |
| Sister-product integration | API-call (PSCRM webhook on `deal.booked`) | Event bus (Inngest) | **Event bus** — decoupling |

**Net result:** AI-native paradigm (Canvas + Graph + DOE + Cmd+K) AS THE FOUNDATION, with Salesforce-depth customization (custom fields + views + dashboards + RBAC overrides + plan tiers) layered IN V1, not pushed to V2.

This is more ambitious than either source PRD. The trade-off is V0 takes 8 weeks instead of 6, V1 takes 16 instead of 12. Worth it: shipping a Canvas-only CRM without customization risks losing the orgs that *need* customization. Shipping a customizable CRM without the Canvas risks being "another Zoho but slower."

---

## 1. Executive Summary

### 1.1 One-Liner

**Builtrix CRM is a Salesforce-depth, AI-native CRM for Indian real-estate sales** — Intelligent Canvas as the primary surface, vectorized graph as the data model, AI agents as bounded colleagues, with full operational depth (custom fields, views, dashboards, RBAC overrides, plan-tier subscriptions) from V1.

### 1.2 The Problem (3 angles)

**For sales reps:** Generic CRMs make them data-entry clerks. 30–40% of a rep's day is field-filling. Reps work *around* the CRM (WhatsApp, Excel) not *with* it.

**For sales managers:** Pipelines are reports, not living surfaces. Stuck deals are invisible until the weekly review. Coaching happens too late.

**For org admins:** Every customization needs the SaaS vendor to build a feature. "Add a field for budget range" is a support ticket, not a 30-second action.

**For founders/owners:** AI buzzwords without architectural rigor — bots that hallucinate offers, automations that break, no audit trail when things go wrong.

### 1.3 The Solution

| Capability | What it solves |
|---|---|
| **Intelligent Canvas** as primary UX | Form fatigue. Adaptive — shows fields that matter *now*. |
| **Vectorized graph** data model (`nodes`/`edges` + pgvector) | "No memory" problem. CRM understands "Priya from Whitefield is the same buyer who walked in last month." |
| **DOE Workflow Engine** + directive authoring | Brittle automation. Org admins write intent ("when stale 14d, surface to manager"); system compiles to tier-bounded actions. |
| **AI agents with T0-T4 tier ceilings** | Hallucination liability. Agents accelerate; humans authorize. Every action audited with `on_behalf_of`. |
| **Customizable fields, views, dashboards** | Vendor-dependency. Org admin self-serves in 30 seconds. |
| **Three-layer RBAC** (base + bridge + overrides) | Permission chaos in growing orgs. Per-org allow/deny on (role × permission). |
| **Sister-product event bus** | Disconnected toolchain. Call summaries land directly on the canvas; legal flags pause deals automatically. |
| **Cmd+K NL command bar** | "Where do I click?" Universal entry point — bounded NL in V1, free-form in V2. |

### 1.4 Success Criteria (V1 — measured per paying org at 90 days)

| Metric | Target |
|---|---|
| Time-to-first-value (org admin signup → first lead on canvas) | ≤ 30 minutes |
| Sales rep daily active usage (% of assigned reps opening canvas ≥1×/day) | ≥ 80% |
| Form-entry time reduction vs. previous CRM (self-reported by orgs migrating) | ≥ 50% |
| % of follow-ups initiated by AI agents (not humans) | ≥ 35% |
| Lead → site-visit conversion lift vs. org's 90-day pre-Builtrix baseline | ≥ 15% |
| Agent T2/T3 approval response time (p50) | ≤ 4 business hours |
| Audit log completeness (every state change logged) | 100% |
| RLS positive/negative test coverage | 100% (all policies) |
| Time-to-customize (org admin adds a custom field) | ≤ 30 seconds |
| Cross-tenant leak incidents | 0 (existential) |

### 1.5 12-Month Targets

| Metric | Target |
|---|---|
| Onboarded paying orgs | 25–40 |
| ARR contribution from CRM alone | ₹1.5–3 Cr |
| Cross-sell rate (CRM org → Call Audit / Legal Auditor) | ≥ 60% |
| Pilot → paid conversion | ≥ 50% |

---

## 2. Strategy & Positioning

### 2.1 Where this sits in the Builtrix Suite

```
                       ┌──────────────────────────────────┐
                       │     BUILTRIX LABS PLATFORM       │
                       └──────────────┬───────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
   ┌────┴─────┐               ┌───────┴────────┐            ┌───────┴─────┐
   │ Call     │               │   AI-NATIVE    │            │  Legal      │
   │ Audit    │ ──events──►   │   CRM          │ ◄──events─ │  Auditor    │
   └──────────┘               │  (THIS PRD)    │            └─────────────┘
                              │                │
                              │ ◄─events──     │
                              │                │            ┌─────────────┐
                              │                │ ◄──events─ │  MIH        │
                              │                │            │  (separate) │
                              └────────────────┘            └─────────────┘

CRM is the spine. Sister products write context onto canvas nodes via event bus.
```

The CRM is the **moat product** — it owns the org's data, has the highest switching cost, and pulls Call Audit + Legal Auditor through.

### 2.2 Ideal Customer Profile (V1)

- Indian real-estate builders, 50–500 reps, 1–10 active project launches
- Brokerages with 20–200 reps focused on resale + new launches
- Channel-partner aggregators with multi-builder lead pipelines
- Annual SaaS budget ₹5L–₹50L
- Already running Excel/WhatsApp or migrating off Zoho/Salesforce

### 2.3 Moat (defensibility)

1. **Real-estate-specific node taxonomy** — `Lead`, `Contact`, `Deal`, `Property`, `Unit`, `SiteVisit`, `Call`, `Activity`, `Document` are first-class node types with domain-aware embeddings.
2. **Native sister-product loop** — Call Audit and Legal Auditor are co-built. Call summaries land *as nodes on the canvas*, not as separate-tab integrations.
3. **DOE directive paradigm** — copying our directive language requires copying our agent runtime + tier framework. Salesforce isn't rebuilding RBAC + tier ceilings overnight.
4. **Constitutional compliance** — provenance + immutable audit + tenant isolation as architectural defaults. RERA-defensible from day 1.
5. **Founder distribution** — Builtrix is already in the door for Call Audit + Legal Auditor. CRM has negative CAC inside existing customers.

### 2.4 Explicit Non-Goals (do not build any of these)

- ❌ Multi-source marketing aggregator (that's MIH — separate product)
- ❌ Campaign management / ad-buying / creative workflow
- ❌ Property listing portal (no consumer-facing discovery)
- ❌ Finance / billing / collections (post-sales scope, V3+)
- ❌ Generic CRM (we are real-estate vertical, opinionated)
- ❌ Autonomous sales bot (Constitution Principle I — agents accelerate, never close)
- ❌ Native mobile apps (V1 web; PWA in V2)
- ❌ No-code platform / app builder
- ❌ Loan disbursement / construction tracking / RERA filing automation (use Legal Auditor)

---

## 3. The Four-Tier User Model

```
Tier 1: super_admin  ──→  Builtrix internal team only. Lives on /platform/*.
                          Provisions orgs, monitors usage, handles platform support.
                          ZERO operational data access.

Tier 2: org_admin    ──→  One per organization. Lives on /admin/* and /settings/*.
                          Pure account-management role (NOT operational by default).
                          Customizes the org's CRM (dashboards, tables, roles, integrations, agents).

Tier 3: operational  ──→  Workspace-scoped roles: workspace_admin, manager, sales_rep,
   roles                  read_only, channel_partner. Lives on /dashboard/* and Canvas.
                          Operate the CRM day-to-day on the Canvas.

Tier 4: agents       ──→  AI service accounts with bounded T0–T4 tier ceilings.
                          Lives in agent runtime; surfaced on canvas + audit log + agent console.
```

### 3.1 Persona quick-card

| Persona | Goal | What the canvas does for them |
|---|---|---|
| **Builtrix Founder** (super_admin) | Onboard orgs, monitor platform health, control AI cost ceilings | Platform surface (`/platform/*`); tenant-management table view (not a canvas) |
| **Sales Director** (org_admin) | Configure org for the team, control access, track usage, set agent personas, write directives | Admin surface (`/admin/*`) — dashboards/tables customization, agent provisioning, integration setup, directive authoring |
| **Sales Manager** (workspace_admin / manager) | Drive pipeline, approve T2/T3 agent actions, supervise reps | Canvas-of-canvases of team's hot deals + per-rep agent approval queue |
| **Sales Rep** | Work assigned leads, schedule site visits, close | Personal canvas list (today's priority leads, ranked by intent) → click any → full Lead canvas |
| **Channel Partner** | Submit leads, track own commission | Scoped canvas — only own submitted leads |
| **Site Visit Coordinator** | Schedule and confirm site visits | Calendar canvas with site-visit nodes |

---

## 4. Super Admin (Builtrix internal)

### 4.1 Provisioning flow — the actual mechanics

This is what you specifically asked about. Step-by-step.

```
Day 1 — Builtrix internal user gets super_admin role
─────────────────────────────────────────────────────
1. Bootstrap script (run ONCE during V0 deploy):
     scripts/bootstrap-super-admin.sh <email>
   → Creates a row in `users` with base_role='super_admin'
   → Sends magic-link via Supabase Auth
   → Logs to audit_log with actor_type='system', action='bootstrap'

2. super_admin signs in at /platform/login
   → Middleware checks base_role. If super_admin → /platform.
                                  If anything else → /dashboard or /admin.

3. super_admin lands on /platform — sees:
   - Total orgs (currently 0)
   - Active orgs (currently 0)
   - Amber banner: "You have ZERO access to operational data inside any org."


Day N — Onboarding a new org (the provisioning flow)
─────────────────────────────────────────────────────
1. super_admin navigates to /platform/organizations/new
2. Fills the form:
   - Org name (e.g. "Lodha Group")
   - Org slug (auto-generated, editable: "lodha-group")
   - RERA registration number (optional but flagged)
   - GSTIN
   - Primary contact (org_admin's name + email + phone)
   - Subscription plan tier (Starter / Pro / Enterprise / Custom)
   - Initial password (auto-generated; admin must reset on first login)

3. On submit:
   a. INSERT into organizations table
   b. Create first workspace (auto-named "<Org name> — Default Workspace")
   c. Create org_admin user with base_role='org_admin'
   d. Provision default agent service accounts based on plan:
        - Starter:    Lead Enrichment (T1) only
        - Pro:        + Follow-up Agent (T2), Site Visit Reminder (T2)
        - Enterprise: + Custom Outbound Agent (T3), all defaults
   e. Insert default subscription record
   f. Initialize org's onboarding_state to {completed_steps: [], current_step: 'org_details'}
   g. Send welcome email to org_admin with:
        - Login URL
        - Initial password (one-time)
        - Link to onboarding wizard
   h. Append row to audit_log: action='create_organization', actor=super_admin

4. super_admin sees confirmation screen with:
   - Org's slug + URL: https://crm.builtrix.in/<org-slug>
   - org_admin's email
   - "View org" button → /platform/organizations/<id>

5. org_admin receives email → clicks login link → resets password →
   lands on /admin → sees onboarding wizard (Step 1: Org details, pre-filled).
```

### 4.2 super_admin permission set (10 platform-only permissions)

```
platform:manage
organizations:view
organizations:create
organizations:edit
organizations:delete
organizations:manage_admins
organizations:manage_subscriptions
platform_analytics:view
platform_tickets:view
platform_tickets:respond
audit:view
```

These are **PLATFORM_ONLY_PERMISSIONS** — explicitly forbidden from being granted to any org-scoped role via overrides.

### 4.3 super_admin surfaces

| Page | Purpose | Key data |
|---|---|---|
| `/platform` | Home / health overview | Total orgs, active orgs, org admin count + amber banner reaffirming "no access to operational data" |
| `/platform/organizations` | All orgs table | Name, plan tier badge, status, users, workspaces, leads/mo, open tickets |
| `/platform/organizations/new` | Provision new org | Form per §4.1 above |
| `/platform/organizations/[id]` | Drill into one org | Tabs: Info / Admins / Subscription / Analytics / Tickets. Reset password, revoke, assign plan |
| `/platform/subscriptions` | Plan catalog | Starter / Pro / Enterprise / Custom — limits + features |
| `/platform/analytics` | Cross-org metrics | Total orgs, active orgs, total active users, open tickets, feature usage events |
| `/platform/audit` | Platform-wide audit log | 500-row most recent, filter by org. Read-only. |
| `/platform/costs` | Per-org × service API spend | Org, service (Anthropic, OpenAI, email, sms, stt), calls, cost ₹ |
| `/platform/tickets` | Platform support inbox | Org-raised tickets. Status + priority. |
| `/platform/tickets/[id]` | Ticket thread | Messages with `is_internal_note` flag |
| `/platform/settings` | Platform settings | Global feature flags, default plan, plan-tier LLM budget defaults |

### 4.4 What super_admin **cannot** do (hard line)

- ❌ Cannot view leads, deals, contacts, calls, or any operational data inside any org
- ❌ Cannot impersonate org users (no shadow-login pattern)
- ❌ Cannot grant themselves operational permissions
- ❌ Cannot bypass org-level RLS without writing a `read_sensitive` row to `audit_log` (reviewed weekly)

Enforced architecturally (RLS + middleware) and in messaging (amber banner on `/platform`).

### 4.5 Plan catalog

| Plan | Price/mo | Max users | Max workspaces | Max leads/mo | AI agents | Retention |
|---|---|---|---|---|---|---|
| **Starter** | Free (pilot only) | 5 | 1 | 500 | T0–T1 only | 90 days |
| **Professional** | ₹14,999 | 25 | 3 | 5,000 | T0–T3 | 1 year |
| **Enterprise** | ₹49,999 | 999 | 999 | 999,999 | T0–T4 + custom personas | 7 years |
| **Custom** | — | per contract | per contract | per contract | per contract | per contract |

Numbers locked from PRD v2 Open Decision Q9 (sales-CRM market is more price-sensitive than post-sales).

---

## 5. Org Admin (the customization plane)

### 5.1 org_admin permission set (~20 permissions — narrowed account-management role)

```
# Account / org management
organizations:view, organizations:edit
settings:manage_users, settings:manage_roles, settings:manage_integrations
support:create, support:view
audit:view
apps:manage
subscriptions:view, subscriptions:manage
billing:view
templates:view, templates:create, templates:activate

# Customization plane
dashboards:customize       # define custom dashboards for the org
tables:customize           # define custom fields + custom views
agents:provision           # provision AI agent service accounts within tier ceiling
agents:approve_T2          # approve T2 agent action templates (one-time per template)
agents:approve_T3          # approve individual T3 agent actions (per-action)
directives:author          # author org-specific directives
```

**Note:** an org_admin who **also needs to operate** the CRM must be granted an additional app role (e.g., `manager`, `sales_rep`) via the bridge. This is the deliberate split — org_admin is the account plane, not the operational plane.

### 5.2 `/admin` cockpit — three rows

**Row 1 — Account state:**
- Current subscription card (plan tier, status, renewal, "View plan & billing")
- Plan usage card (UsageBars: Active users, Workspaces, Leads/mo, AI tokens/mo)
- Support card (open ticket count, "View tickets" + "File new")

**Row 2 — Configuration:**
- Users card (count + "Manage users" → `/settings/users`)
- Integrations card ("Manage integrations" → `/settings/integrations`)
- App access card (which Builtrix products this org has — CRM, Call Audit, Legal Auditor)

**Row 3 — Customization:**
- Dashboards card ("Configure dashboards" → `/admin/dashboards`)
- Tables & fields card ("Configure tables" → `/admin/tables`)
- AI agents card ("Provision agents" → `/admin/agents`)
- Directives card ("Author directives" → `/admin/directives`) — NEW

**Onboarding banner** (top, dismissable per step) when `onboarding_state.completed === false`.
**Integration failure banner** when any default email/whatsapp provider is missing.

### 5.3 8-step onboarding wizard (re-scoped for sales CRM)

| Step | What happens | Hard-gate? |
|---|---|---|
| 1. Org details | RERA, GSTIN, billing address, primary contact | Yes |
| 2. Branding | Logo, primary color (used in agent-sent comms) | No |
| 3. First workspace | Create the first workspace (e.g., "Mumbai Sales") | Yes |
| 4. Lead sources | Pick sources (90Sec, MagicBricks, Housing.com, Facebook, walk-in, channel partners) | No |
| 5. Pipeline stages | Confirm or customize default 7-stage pipeline (New → Contacted → Qualified → Site Visit → Negotiation → Booked → Lost) | No |
| 6. Add team users | Invite first 3 users with app roles | No |
| 7. Configure integrations | Email + WhatsApp + (optional) telephony for Call Audit hand-off | No |
| 8. Sample lead demo | Walk through synthetic lead from create → qualify → schedule visit → mark booked | No |

Steps 1 & 3 are **hard gates**. Other steps skippable + revisitable.

### 5.4 `/admin/dashboards` — Customizable dashboards

#### 5.4.1 Concept model

```
Dashboard           ── named layout (e.g., "Sales Director View")
  └── Widget        ── one card on the dashboard (kpi | chart | table | list | map | funnel | agent_status)
       └── Source   ── what data feeds it (saved query | metric | live feed)
            └── Filter  ── workspace / date / owner / etc.
```

#### 5.4.2 Schema

```sql
dashboards
  id, organization_id, workspace_id (nullable, null=org-wide), name, description,
  is_default_for_role (text array — roles that get this on landing),
  layout (jsonb — grid layout: {widgetId, x, y, w, h}[]),
  + provenance fields

dashboard_widgets
  id, dashboard_id, type, title, config (jsonb), data_source_id, filters (jsonb),
  refresh_interval_seconds, + provenance

saved_queries
  id, organization_id, name, table_name, columns (jsonb), filters (jsonb),
  group_by (text array), order_by (jsonb), limit_n int, + provenance

dashboard_assignments
  id, dashboard_id, role text NULL, user_id uuid NULL, workspace_id uuid NULL
```

#### 5.4.3 Widget catalog (V1)

| Widget | Use case |
|---|---|
| `kpi` | Single number with delta ("Leads this week: 142 ▲ 12%") |
| `chart_line` | Time series (leads over last 90 days) |
| `chart_bar` | Categorical (leads by source, deals by stage) |
| `chart_pie` | Distribution (pipeline by owner) |
| `table` | Custom table with filters ("Hot leads — score > 80, no activity 7d") |
| `list` | Recent items ("Last 10 calls audited") |
| `map` | Geographic distribution (site visits by city) |
| `agent_status` | Live AI agent activity feed |
| `funnel` | Pipeline funnel by stage with conversion % |

#### 5.4.4 Pre-built templates (ship in V1)

To keep TTV under 30 min, ship 5 dashboards out-of-the-box (all clonable):

1. **Executive Overview** — total pipeline ₹, leads this week, deals closed, conversion rate, agent ROI
2. **Sales Manager** — pipeline by rep, leads aging, follow-ups overdue, T3 approvals pending
3. **Sales Rep** — my leads, my pipeline funnel, my calls today, my next 5 follow-ups
4. **Channel Partner Manager** — leads by partner, partner commissions, partner conversion rates
5. **Site Visit Manager** — site visits scheduled, today's walk-ins, post-visit follow-ups

#### 5.4.5 UX flow (org admin)

1. `/admin/dashboards` lists existing (system templates + org-created)
2. "Create dashboard" → name, description, target roles (multi-select)
3. Drag-and-drop widgets onto a 12-col grid (`react-grid-layout`)
4. Each widget: pick type → pick data source → set filters → save
5. Set "is_default_for_role" — when a `sales_rep` lands on `/dashboard`, they see this dashboard
6. Users can clone for personal use; personal dashboards don't override the org default for that role

### 5.5 `/admin/tables` — Customizable tables / fields

#### 5.5.1 Three layers of customization

| Layer | What it lets the org_admin do | Schema impact | V1? |
|---|---|---|---|
| **L1 — Custom fields** | Add fields to existing entities (Lead, Deal, Contact, Property, Activity, Call) | `custom_fields` metadata table + `custom_data jsonb` column on each entity | ✅ V1 |
| **L2 — Custom views** | Define table views (columns, filters, sorts) on any entity | `table_views` table | ✅ V1 |
| **L3 — Custom entities** | Define entirely new entity types (e.g., "Site Visit Slip") | `custom_entities` + `custom_entity_records` | ❌ V2 (post 5+ org requests) |

#### 5.5.2 L1: Custom fields schema

```sql
custom_fields
  id, organization_id, entity_type ('lead'|'deal'|'contact'|'property'|'activity'|'call'),
  field_key text (snake_case, unique per (org, entity)),
  label text,
  type ('text'|'number'|'date'|'datetime'|'select'|'multiselect'|'boolean'|'phone'|'email'|'url'|'currency'),
  options jsonb,                    -- for select/multiselect
  is_required boolean, default_value jsonb,
  show_in_table_views boolean, show_in_form boolean, show_on_canvas boolean,
  + provenance fields

# On the entity tables (or as 'data.custom' inside the unified nodes table):
nodes  (where node_type = 'lead', etc.)
  ... standard fields ...
  data jsonb           -- includes 'custom' subkey holding L1 custom field values
```

**Why JSONB and not separate columns:**

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Separate column per custom field (DDL on save) | Indexable, type-safe at DB | Schema explosion, migration storm, multi-tenant nightmare | ❌ |
| **JSONB column with field metadata** | One schema, infinite flexibility per org, GIN-indexable | Lookups slightly slower, type checking in app layer | ✅ |
| EAV (key-value table) | Most flexible | 5x slower joins, terrible UX | ❌ |

V1 starts with 7 field types (text, number, date, select, multiselect, boolean, currency). Adds phone/email/url/datetime in V1.1.

#### 5.5.3 L2: Custom views schema

```sql
table_views
  id, organization_id, entity_type, name,
  is_default_for_role text NULL, is_personal boolean (true = user-only), created_by uuid,
  columns jsonb (array of {field_key, width, order, visible}),
  filters jsonb (array of {field_key, op, value}),
  sort jsonb ({field_key, direction}),
  page_size int default 25,
  + provenance fields
```

**UX:** On any entity list page, view selector dropdown at top: "All Leads", "My Hot Leads", "Stale Leads". Org admin creates org-wide views; users save personal views from current filter state.

### 5.6 `/admin/agents` — AI agent provisioning

Org admin can:
- View installed agents (Lead Enrichment, Follow-up, Site Visit Reminder, Stale-lead Watcher, Call Audit Sync, Custom Outbound)
- Provision a new agent: agent type → tier ceiling → rate limits → scope (workspaces) → schedule → tone (formal/friendly/urgent) → language (English/Hindi)
- Per-agent activity (last 30d): actions taken, T2/T3 approvals pending, approval rate, token spend
- Suspend an agent (kill switch — instant)

**Tier ceiling is HARD, set at provisioning time, cannot be elevated mid-session.** Constitution Principle I.

### 5.7 `/admin/directives` — Directive authoring (NEW vs. PRD v1)

This is the org admin's gateway to the DOE Workflow Engine.

#### 5.7.1 Pre-built directive library (ships in V0)

| # | Directive | Tier |
|---|---|---|
| D-01 | When a new lead arrives, run lead enrichment and set intent score | T1 |
| D-02 | When a lead reaches Qualified and is silent 24h, send template T-08 | T2 |
| D-03 | When a site visit is 24h away, send confirmation reminder | T2 |
| D-04 | When a site visit is 2h away, send map + parking instructions | T2 |
| D-05 | When a site visit completes, draft thank-you + feedback request for rep approval | T2/T3 |
| D-06 | When intent score crosses 75, notify assigned rep on canvas | T0 |
| D-07 | When a deal moves to Negotiation, surface project pricing sheet | T0 |
| D-08 | When a deal moves to Booked, hand off to PSCRM and Legal Auditor | T1 |
| D-09 | When Call Audit indicates 'objection: price', surface objection-handling playbook | T0 |
| D-10 | When a lead is silent 14 days and stage is not terminal, mark Stale + surface to manager | T0 |
| D-11 | When a CP submits a lead, route to workspace's CP Coordinator | T1 |
| D-12 | When a lead's project preference matches a unit's profile, surface match | T0 |
| D-13 | When a Legal Auditor flag is raised on a deal's documents, pause the deal + notify rep+manager | T1 |
| D-14 | When MIH pushes a lead with score > 80, route to senior rep | T1 |
| D-15 | When a lead source is 'Walk-in', auto-attach the showroom location node | T1 |

#### 5.7.2 Custom directive authoring (V1)

V1 = bounded NL. Org admin picks from templates and customizes axes (schedule, scope, language, rate limit, template ID).
V2 = free-form NL. Org admin writes "When a lead from Whitefield mentions loan options, surface Legal Auditor's loan checklist" → Directive Compiler (T1 agent) parses → produces a reviewable action plan → org admin approves in admin UI → directive activates.

### 5.8 `/admin/billing`, `/admin/apps`, `/admin/system-health`, `/admin/webhooks`

Inherited from PRD v1 §4.2 verbatim:
- **Billing** — current plan, past invoices, payment method (Razorpay portal in iframe, no card storage), usage history
- **Apps** — Builtrix product cross-sell surface
- **System health** — background jobs, webhook delivery, integration sync status, failed jobs with retry
- **Webhooks** — outbound webhook config (events → URLs), retry / dead-letter view

### 5.9 `/settings/users`, `/settings/roles`, `/settings/integrations`, `/settings/document-templates`, `/settings/support`

Inherited from PRD v1 §4.2 verbatim:
- **Users** — table with base role + app roles + status; soft-delete only
- **Roles** — per-org allow/deny on (role × permission); deny wins; PLATFORM_ONLY_PERMISSIONS filtered out
- **Integrations** — Email (SMTP/Resend), WhatsApp (Meta/Gupshup/Wati), Telephony (Exotel/MyOperator/Knowlarity), CRM connectors (Zoho/Salesforce inbound), Lead source connectors (90Sec/MagicBricks/Housing.com/FB Lead Ads), Calendar (Google/Outlook)
- **Document templates** — per-org templates for offer letter, booking form, allotment letter, registration ack, agreement to sell
- **Support** — org-side ticket inbox

---

## 6. The Intelligent Canvas (operational tier UX)

### 6.1 Canvas concept (single example: Lead canvas)

```
┌────────────────────────────────────────────────────────────────┐
│  ⌘K  Search anything · "show hot leads in Bangalore"           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Priya Sharma                              ● HOT · Score 87    │
│  3 BHK · Bangalore · ₹1.8 Cr ± 10%                             │
│                                                                │
│  ─── Activity Stream ─────────────────────────────────────     │
│                                                                │
│  ⏱ 2 hours ago  · 📞 Call from Rakesh Kumar (12 min)            │
│     ▸ Discussed financing; loan pre-approval ready             │
│     ▸ Site visit requested for Saturday                        │
│     [Call Audit summary · 👁 view transcript]                   │
│                                                                │
│  ⏱ Yesterday    · 💬 WhatsApp inbound                          │
│     "Hi, what's the floor plan for the 3BHK in Whitefield?"   │
│                                                                │
│  ⏱ 3 days ago   · 🔗 Lead source: 99acres                       │
│     [enriched by Lead Enrichment Agent · 🤖 confidence 0.92]   │
│                                                                │
│  ─── ✨ Suggested next action ─────────────────────────────────  │
│                                                                │
│  📅 Schedule Saturday site visit · Vinod available 10am–1pm    │
│  ▶ [Confirm slot] [Customize] [Snooze]                         │
│                                                                │
│  ─── 🤖 Agent activity ────────────────────────────────────────  │
│                                                                │
│  Follow-up Agent (T2) — drafted WhatsApp reply with floor      │
│  plan PDF attached.  ▶ [Review & send] [Reject]                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Canvas design principles (binding from Constitution IX)

| # | Principle | What it means |
|---|---|---|
| C1 | **Progressive disclosure** | Show 3 fields that matter *now*. Other 44 accessible via "More" or Cmd+K. |
| C2 | **Story over schema** | Canvas is a chronological narrative (Activity Stream), not a row in a table. |
| C3 | **AI as a colleague, visible** | Every agent action visible: name + tier badge (T0–T4) + audit link. No invisible "magic." |
| C4 | **Action where the data lives** | Schedule a site visit by clicking on canvas. Approve drafted message inline. No "go to Activities tab." |
| C5 | **Apple-grade motion** | Stage transitions animate (Framer Motion). Adding a contact zooms in. Canvas-of-canvases pans + zooms. Motion is functional, not decorative. |
| C6 | **Cmd+K is the OS** | Every navigation, query, and action accessible from a single command bar. NL-aware. |
| C7 | **Single canvas per node type** | Lead canvas. Deal canvas. Property canvas. Same paradigm, type-aware fields. |
| C8 | **No tabs, ever** | Tabs are an admission of failure. Use Cmd+K, sections, or canvas-of-canvases. |

### 6.3 Canvas component architecture

| Layer | Tech | Role |
|---|---|---|
| Canvas shell | React 19 + Framer Motion | Document surface, pan/zoom, stage transitions |
| Field renderers | shadcn/ui + custom adaptive components | Type-aware field rendering; show/hide based on context |
| Activity Stream | Supabase Realtime subscription | Append-only chronological feed |
| Agent panel | DOE engine bridge | Renders pending agent actions, approval UI |
| Cmd+K | `cmdk` library + NL search backend | Universal command bar |
| Suggestion engine | DOE engine + node embeddings | "Suggested next action" cards |
| State | React Server Components + Server Actions | Server-authoritative; no client-side caching of permissions |

### 6.4 Canvas-of-canvases (Manager view)

When Sales Manager opens dashboard, sees pannable surface with reps' active deals as live mini-canvases. Click in to zoom into any deal. Filter via Cmd+K.

V1 = top 50 hot deals as mini-canvases on a 2D surface with pan + zoom (D3 or vanilla).
V2 = full pipeline visualization with funnel + stage swimlanes overlaid.

### 6.5 Custom fields on canvas

Custom fields (L1) created by org admin appear on the canvas in the section the org admin chooses (`show_on_canvas: true` flag). Type-aware rendering — a `currency` field renders with the org's branding color; a `date` field renders with relative time + calendar picker.

---

## 7. Graph + Vector Data Model

### 7.1 Why a graph + vector

Real-estate sales is BOTH relational (this lead came from this campaign and is also this person who walked into our showroom and is brother of this previous customer) AND semantic (find leads similar to ones who booked in Q1). Pure relational handles relations poorly (joins everywhere). Pure vector handles semantics but loses provenance. We use both, on Postgres — relational tables for nodes/edges + provenance, pgvector for embeddings.

### 7.2 Schema overview

```sql
nodes
─────────────────────────────────────
  id              uuid PK
  org_id          uuid FK
  workspace_id    uuid FK
  node_type       text  -- 'lead'|'contact'|'deal'|'property'|'unit'|
                        --  'site_visit'|'call'|'activity'|'document'|'note'
  label           text
  data            jsonb -- type-specific structured fields + custom field values
  embedding       vector(1536)  -- pgvector
  state           text  -- type-specific stage
  + provenance fields (Constitution III)

edges
─────────────────────────────────────
  id              uuid PK
  org_id          uuid FK
  workspace_id    uuid FK
  from_node_id    uuid FK nodes
  to_node_id      uuid FK nodes
  edge_type       text  -- 'belongs_to'|'related_to'|'sourced_from'|'attended'|
                        --  'mentioned_in'|'duplicate_of'|'merged_into'
  weight          numeric
  + provenance fields

node_signals      -- intent scoring, calculated derivatives
─────────────────────────────────────
  id              uuid PK
  node_id         uuid FK nodes
  signal_type     text  -- 'intent'|'engagement'|'budget_match'|'velocity'
  signal_value    numeric
  computed_at     timestamptz
  computed_by     uuid
  + provenance fields

audit_log         -- inherited from Constitution IV
```

**Why one `nodes` table instead of `leads`/`contacts`/`deals`:**

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Separate tables per type | Familiar; type safety in schema | Hard to query across types; duplicate provenance fields; agent code branches per type | ❌ |
| **Single `nodes` table with `node_type`** | One canvas component for all; easy semantic search across types; one provenance contract; embedding similarity trivial | Type-specific columns in `data` jsonb; less DB-level type safety | ✅ |
| Triple store (RDF) | Maximally flexible | Overkill; tooling sparse | ❌ |

**Type-specific JSONB schemas** documented in `baseline/111-lead-lifecycle-domain.md`. Each node_type has a Zod schema in `src/lib/nodes/schemas/<type>.ts`. App layer enforces type safety; DB stores as jsonb.

### 7.3 Indexes

- `nodes (org_id, workspace_id, node_type, state)` — most canvas queries
- `nodes USING ivfflat (embedding vector_cosine_ops)` — semantic search
- `edges (from_node_id, edge_type)` and `edges (to_node_id, edge_type)` — graph traversal
- `nodes USING gin (data)` — jsonb field queries (custom fields included)

### 7.4 Embedding strategy

- Every node has an embedding computed from `text_of_record(node)` (label + key fields + recent activity).
- Embeddings refreshed on node updates via Postgres trigger queueing (Inngest job).
- Embedding model: `text-embedding-3-small` via Model Gateway (cheap, 1536-dim).
- Privacy: embeddings stored in same workspace as source node; never exfiltrated.

---

## 8. Lead Lifecycle Domain (the actual CRM)

### 8.1 Canonical pipeline (configurable name per org, fixed transitions)

```
New → Contacted → Qualified → Site Visit Scheduled → Site Visit Done → Negotiation → Booked
                                                                                       ↓
                                                                                    (handoff to PSCRM)
```

Plus terminal: `Lost`, `On Hold`, `Junk`.

### 8.2 Node lifecycle states

| Node type | Lifecycle states |
|---|---|
| `lead` | new → contacted → qualified → (hands off to deal) |
| `contact` | (no states; just enriched-ness) |
| `deal` | qualified → site_visit_scheduled → site_visit_done → negotiation → booked / lost |
| `property` | available → held → booked → sold |
| `unit` | (mirrors property at unit level) |
| `site_visit` | scheduled → confirmed → completed → no_show |
| `call` | (no states; created by Call Audit integration) |
| `activity` | (touchpoint log; no states) |
| `document` | uploaded → verified → signed |
| `note` | (free text by rep) |

### 8.3 Capture sources (V1 — basic, NOT MIH)

| Source | Mechanism | Idempotency key |
|---|---|---|
| Manual create on canvas | Sales rep clicks "New lead" | n/a |
| Web form embed (Builtrix-hosted) | Webhook | form submission ID |
| WhatsApp Business inbound | Webhook | message ID |
| Email parse (basic — single mailbox per workspace) | IMAP poll + LLM extract | message ID |
| Call Audit hand-off | Internal event bus | call ID |
| MIH attribution push (when MIH connected) | Internal event bus | unified_lead ID from MIH |
| CSV import | Admin UI + dry-run | CSV row hash + batch ID |

V1 deliberately does NOT include: Meta/Google ad webhooks, property portal email parse, multi-source dedup, attribution modeling. **Those are MIH's job.** CRM accepts what MIH sends.

---

## 9. RBAC Engine (three-layer resolution)

### 9.1 Resolution

```
effective_permissions(user, organization, workspace) =
    base_permissions(user.role)                              -- layer 1: TS literal in rbac.ts
    UNION   user_app_roles_for(user, organization, workspace) -- layer 2: bridge table
    UNION   allow_overrides_for(role, organization)          -- layer 3a: per-org allow
    EXCEPT  deny_overrides_for(role, organization)           -- layer 3b: per-org deny
```

**Deny wins.** A permission can never be granted via override if it appears in `PLATFORM_ONLY_PERMISSIONS`.

### 9.2 Tables

```sql
user_app_roles
  id, user_id, organization_id, workspace_id (nullable, null = all workspaces in org),
  product_id text DEFAULT 'crm' (for future Call Audit / Legal Auditor cross-product roles),
  app_role text (must be one of GRANTABLE_APP_ROLES),
  granted_by, reason text, + provenance fields

role_permission_overrides
  id, organization_id, role text, permission text, mode ('allow'|'deny'),
  reason, created_by, created_at, updated_at
```

### 9.3 Permission domains for sales CRM (~120 permissions)

```
# Core operational
leads:view, leads:create, leads:edit, leads:delete, leads:assign, leads:bulk_import, leads:export
deals:view, deals:create, deals:edit, deals:close_won, deals:close_lost
contacts:view, contacts:create, contacts:edit, contacts:merge
properties:view, properties:create, properties:edit, properties:hold (T3 agent action), properties:release
activities:view, activities:create, activities:edit
calls:view, calls:listen, calls:export
campaigns:view, campaigns:create, campaigns:execute

# Customization
dashboards:customize, dashboards:view_org_wide
tables:customize
templates:approve_outbound (for T2 templated comms)

# Agents
agents:provision, agents:approve_T2, agents:approve_T3, agents:suspend, agents:view_activity

# Directives
directives:author, directives:approve, directives:view_org_wide
```

Authoritative file: `src/lib/auth/rbac.ts`. Adding a permission = TS literal change, no migration. Adding a role = enum migration.

### 9.4 V1 RBAC permission matrix (excerpt)

✓ allowed · × forbidden · Δ with approval

| Action | super_admin | org_admin | workspace_admin | manager | sales_rep | channel_partner | read_only |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| View canvas (own leads) | × | ✓ | ✓ | ✓ | ✓ | ✓ (own submitted) | ✓ |
| View canvas (workspace) | × | ✓ | ✓ | ✓ | × | × | ✓ |
| Create lead | × | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| Edit lead (own) | × | ✓ | ✓ | ✓ | ✓ | × | × |
| Move lead through stages | × | ✓ | ✓ | ✓ | ✓ | × | × |
| Schedule site visit | × | ✓ | ✓ | ✓ | ✓ | × | × |
| Mark deal Booked (T1) | × | ✓ | ✓ | ✓ (with approval) | Δ (manager approval) | × | × |
| Approve T2 agent action template | × | ✓ | ✓ | ✓ | × | × | × |
| Approve T3 agent action (per-action) | × | ✓ | ✓ | ✓ | × | × | × |
| Author directive | × | ✓ | × | × | × | × | × |
| Provision agent | × | ✓ | × | × | × | × | × |
| Customize fields, views, dashboards | × | ✓ | × | × | × | × | × |
| Bulk import (T4) | × | ✓ + dry-run | × | × | × | × | × |
| View audit log | × | ✓ | ✓ (workspace) | ✓ (workspace) | × | × | × |

---

## 10. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Tenant isolation** | RLS on every table; org-level + workspace-level scopes (Constitution II) |
| **Provenance** | Every record carries provenance fields (Constitution III) |
| **Audit** | Every state change appends to `audit_log` (Constitution IV) |
| **Idempotency** | Every event ingestion endpoint idempotent by `source_event_id` |
| **Canvas load p95** | < 1.5 seconds (Lead canvas with 50 activities) |
| **Cmd+K response p95** | < 300ms (catalog match), < 800ms (free NL — V2) |
| **Embedding refresh latency p95** | < 30 seconds from node update |
| **Agent action invocation p95** | < 2 seconds (T1), < 5 seconds (T2 templated) |
| **Custom field create-to-live latency** | < 5 seconds (Server Action `revalidatePath`) |
| **Availability** | 99.5% (Vercel + Supabase baseline; degraded mode = canvas read-only) |
| **PII handling** | Phone, email, name, ID = PII; masked in logs; never in LLM prompts without redaction |
| **Data residency** | Supabase region per org (DPDP — India region for Indian customers) |
| **Retention** | Soft-delete only; default 5 years post-deal-close (RERA scope) |
| **LLM cost cap** | Two-level: super_admin sets plan-tier defaults; org_admin customizes within ceiling |
| **Backups** | Daily automated, 30-day retention, point-in-time recovery via Supabase |
| **Coverage** | ≥80% lines / ≥90% branches (V5 D-06) |
| **Acceptance test pass rate** | 100% (V5 D-06) |
| **Security** | CRITICAL = 0; HIGH/MED logged + parallel-fixed (V5 D-07) |

---

## 11. Phased Build Plan

### V0 — MVP (Weeks 1–8)

**Goal:** One paying pilot org running end-to-end. Lead created → qualified → site-visited → booked, on the canvas, with one AI agent active.

| Week | Directive | Scope |
|---|---|---|
| 1 | D-001 — V5 scaffold + constitution + baselines | Run `init.mjs`, drop constitution v2.0, baselines 100/110/111/112 |
| 1–2 | D-002 — Multi-tenancy foundation | Orgs, workspaces, users, user_app_roles, RLS policies, super_admin bootstrap script |
| 2–3 | D-003 — Graph data model | `nodes`, `edges`, `node_signals`, pgvector setup, RLS, embedding queue |
| 3 | D-004 — RBAC engine | `rbac.ts` (~120 perms × 9 roles), `role_permission_overrides`, 3-layer resolver, tests |
| 3–4 | D-005 — Super admin surfaces | `/platform/*` — orgs CRUD, plans, analytics, audit, costs |
| 4 | D-006 — Org admin cockpit | `/admin` landing + 8-step onboarding wizard |
| 4–5 | D-007 — Intelligent Canvas component (Lead canvas only) | Adaptive fields, Activity Stream, Suggested action card, agent panel shell |
| 5 | D-008 — Lead create + edit + stage transitions on Canvas | Full Lead lifecycle on Canvas |
| 5 | D-009 — Cmd+K bounded catalog (30 queries) | Universal command bar |
| 5–6 | D-010 — Lead Enrichment Agent (T1) + Model Gateway V0 | First agent; `src/lib/ai/gateway.ts`; per-tenant budget cap |
| 6 | D-011 — Activity Stream + WhatsApp inbound webhook | Touchpoint logging |
| 6–7 | D-012 — DOE engine V0 (15 pre-built directives) | Trigger + action invocation; audit |
| 7 | D-013 — Site Visit node + Google Calendar | Schedule + reminder agent (T2) |
| 7 | D-014 — Call Audit event bus integration | Inbound `call.audited` events |
| 7–8 | D-015 — V0 hardening | RLS audit, p95 perf tuning, pen-test, pilot onboarding |

**V0 acceptance:**
- Pilot org onboarded in < 30 min
- 1 sales rep active for 5 days, processes 10+ leads on the canvas
- Canvas p95 load < 1.5s
- Lead Enrichment Agent runs on every new lead with audit trail
- Site visit scheduled + reminded automatically
- Call Audit summaries land on canvas within 60s of call completion

### V1 — General Availability (Weeks 9–16)

| Week | Directive | Scope |
|---|---|---|
| 9–10 | D-110 — Deal canvas + Property canvas + Unit canvas | All node types get canvases |
| 10 | D-111 — Canvas-of-canvases (manager view) | Pannable surface, filter via Cmd+K |
| 10–11 | D-112 — **Custom fields engine (L1)** | `custom_fields` metadata + JSONB on entities + canvas integration |
| 11 | D-113 — **Custom views engine (L2)** | View selector UX on entity list pages |
| 11–12 | D-114 — **Custom dashboards engine** | Drag-drop builder, 5 pre-built templates |
| 12 | D-115 — Follow-up Agent (T2) + approval queue UI | Pre-approved templates, approval queue |
| 12 | D-116 — Custom Outbound Agent (T3) | AI-drafted, human-approved per action |
| 12–13 | D-117 — Channel Partner Portal V1 | Submit + status only |
| 13 | D-118 — Legal Auditor event bus integration | Document-flag handling, deal pause |
| 13 | D-119 — MIH event bus integration | Inbound attributed leads + routing directive |
| 13–14 | D-120 — Persona Creator V1 | Tone, schedule, scope, language, rate limit |
| 14 | D-121 — Cmd+K free-form NL (limited; catalog match with confidence) | First step toward V2 NL |
| 14 | D-122 — Cross-workspace lead reassign (T3) | Dual approval, audit |
| 14–15 | D-123 — Stale-lead Watcher Agent (T0) + manager surfacing | Stale detection, manager queue |
| 15 | D-124 — Plan-tier LLM budget defaults (super_admin) | Two-level cost cap |
| 15–16 | D-125 — V1 hardening + pen-test | Full RLS audit, SOC2 readiness |

### V2 — Differentiation (Weeks 17–28)

- Free-form NL → SQL (Cmd+K)
- Prompt-to-Schema engine (super_admin proposes migration → human reviews)
- NL Permissions Compiler
- Free-form NL directives (full compilation); agent-to-agent orchestration
- PWA for sales reps
- ML-based intent scoring
- Zero-Retention pipelines for sensitive PII
- T4 admin tools (bulk re-embed, bulk reassign, bulk import with dry-run)
- L3 custom entities (post 5+ org requests)

### V3 — Moat (Weeks 29+)

- Cross-org benchmarking (anonymized, opt-in)
- Predictive deal scoring (ML on historical bookings)
- Local SLM for sensitive flows
- White-label CP portal
- Multi-language canvas (Tamil / Telugu / Kannada / Marathi)

---

## 12. Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Canvas paradigm fails to land — sales reps want familiar tabs/forms | **High** | Onboarding wizard shows pre-built canvas; pilot with friendly customer first; instrument time-on-canvas vs. time-on-Cmd+K to validate adoption |
| R2 | Graph data model query performance at scale | High | pgvector + Postgres indexes; canvas queries cached per-node; embedding refresh async (Inngest) |
| R3 | DOE compiler produces unsafe action plans (e.g., infinite loops) | High | Compiled plans go through Plan Mode review at directive authoring time; runtime caps loops at 5 iterations; tier ceilings always enforced |
| R4 | **Tenant isolation leak via service-role queries** | **Existential** | Constitution II; mandatory `audit_log.read_sensitive` on every bypass; weekly review; pen-test before GA |
| R5 | Cmd+K NL queries return wrong data (V2 free-form risk) | High | V1 stays bounded to catalog; V2 NL → SQL passes static analyzer + read-only transactions + audit log |
| R6 | Custom fields tar pit — every org wants something different, support balloons | High | Hard-cap at L1 (custom fields) + L2 (views). Refuse L3 (custom entities) until 5+ orgs ask. |
| R7 | Custom dashboards become slow as orgs add many widgets querying live data | Medium | Server-side widget cache (Redis), per-widget refresh intervals, hard widget-per-dashboard cap (20) |
| R8 | Agent T3 approval queue becomes bottleneck if agents draft faster than humans approve | Medium | Per-agent rate limits, approval-workload visualization for managers, default templates expand T2 set |
| R9 | JSONB custom_data column performance at scale | Medium | GIN index per entity; per-org expression indexes on hot fields; query budget limits |
| R10 | **Channel partner sees other CPs' leads** | **Existential** | Workspace-scoped RLS; channel_partner role allowlist of `submitted_by_user_id = self`; explicit e2e test |
| R11 | AI agent exfiltrates data via outbound comms (T2/T3) | High | T2 templates pre-approved by org_admin; T3 every action human-approved; no agent can send to addresses not in lead/contact records |
| R12 | Solo founder build velocity slips — V1 takes 24 weeks not 16 | Medium | Path C trade-offs locked (defer Prompt-to-Schema, NL Permissions, full NL Cmd+K to V2); ruthless V0/V1 scoping |
| R13 | Sister product integration breaks (Call Audit changes event schema) | Medium | Event bus contracts versioned; CRM tolerates v_n and v_n+1 in parallel; deprecation window |
| R14 | LLM cost overruns at scale | Medium | Per-tenant budget cap with hard-stop; embedding model is cheap; deterministic-first agent design (T0 reads cost nothing) |
| R15 | Onboarding wizard >30min causes drop-off | High | Mark steps 2/4/5/6/7/8 skippable; only Step 1+3 hard-gated |

---

## 13. Definition of Done — V1.0

- [ ] super_admin can provision a new org from `/platform/organizations/new` and the org_admin gets a working login email
- [ ] org_admin lands on `/admin` and sees onboarding flow leading to canvas
- [ ] Onboarding completes in < 30 minutes for a non-technical sales ops person
- [ ] org_admin can invite a sales_rep, grant them an app role, and that rep lands on their canvas
- [ ] sales_rep can create a lead, log activities, move it through 7 stages to "Booked" — entirely on the canvas
- [ ] Lead Enrichment Agent runs automatically on every new lead, with audit trail
- [ ] Site Visit Reminder Agent sends 24h + 2h reminders via WhatsApp
- [ ] org_admin authors a directive from the 15-template library, customizes 1 axis (e.g., schedule), and it executes against new leads
- [ ] org_admin can create a custom field on `leads`, and it appears on the Lead canvas within 5 seconds
- [ ] org_admin can create an org-wide custom view on `/leads`, and a sales_rep sees it in their view selector
- [ ] org_admin can create a custom dashboard, assign it to a role, and that role's users land on it
- [ ] Call Audit summary appears in lead's Activity Stream within 60s of call completion (when Call Audit is connected)
- [ ] An RLS test suite proves: no cross-org access; channel_partner sees only own submitted leads; sales_rep sees only own + team
- [ ] Canvas p95 load < 1.5 seconds with 50 activities
- [ ] Cmd+K p95 response < 300ms (catalog match)
- [ ] Every state-changing action writes a row to `audit_log` with full provenance
- [ ] super_admin attempting `/dashboard/leads` is redirected to `/platform`; org_admin attempting `/platform` is redirected to `/admin`
- [ ] At least 1 friendly pilot org has been onboarded end-to-end and used the product for 1 week with 0 P0/P1 issues

---

## 14. Cross-references

- **Constitution:** `Builtrix-CRM-Constitution-v2.0.md` (lives at `memory/constitution.md`)
- **V5 spec authority:** `VIBE_OS_V5_SPEC.md` (in V5 source repo, not copied to CRM repo)
- **Build playbook:** `INSTALL-AND-FIRST-BUILD.md` (this directory)
- **Source PRD v1 (superseded):** `Builtrix-CRM-PRD-v1.md`
- **Source PRD v2 (superseded):** `builtrix-ai-native-crm-prd-v1.md`

---

**End of consolidated PRD v2.0.**
