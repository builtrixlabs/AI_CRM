<!--
Sync Impact Report
==================
Version change: 1.0.0 → 2.0.0 (MAJOR)
Reason: Merged AI-native paradigm (Intelligent Canvas, graph+vector, DOE engine,
NL-Compile-Then-Apply) with Salesforce-depth surface (customizable dashboards,
custom fields, custom views, full RBAC override engine, plan-tier subscriptions).

Built on: Vibe Coding OS V5
Path: This document lives at `memory/constitution.md` in the CRM repo.

Modified principles:
  - All v1 principles RETAINED (I-VIII)
  - Added IX. Intelligent Canvas Is the Interface (formerly proposed)
  - Added X. NL-Compile-Then-Apply (formerly proposed)
  - Added XI. Customization Is a First-Class Feature (NEW — Salesforce-depth)

Added sections:
  - Customization Layers (L1 fields / L2 views / L3 entities)
  - Sister-Product Integration Contract (event bus discipline)
  - Updated Stack Discipline (pgvector locked, Inngest locked, model gateway locked)
  - Tier 0-4 mapping for new agent types

Templates affected:
  - spec-template.md — must reference Canvas-first UX
  - plan-template.md — must check tier mapping for any new agent action
  - tasks-template.md — must include audit log + provenance + RLS tasks per migration
-->

# Builtrix AI-Native CRM Constitution

**Product:** Builtrix CRM — Salesforce-depth AI-native sales workforce for Indian real-estate
**Stack OS:** Vibe Coding OS V5
**Authority:** Constitutional — supersedes all directives, conversation, learned patterns. Cannot be overridden by Claude or operator without amendment.
**Path in repo:** `memory/constitution.md`

---

## Preamble — What This Product Is

Builtrix CRM is a **multi-tenant SaaS for Indian real-estate organizations** (builders, brokerages, channel-partner networks). It captures, qualifies, and progresses leads from first-touch through booking and post-sales — and runs **AI agents as workforce members** alongside human sales staff: lead-enrichment, follow-up, call-audit, site-visit, and stale-lead-watcher agents.

The product has two non-negotiable postures:

1. **AI-native** — the primary UX is the Intelligent Canvas (an adaptive document surface), the data model is a vectorized graph, workflows are authored as directives (not if-this-then-that), and AI agents are first-class actors with bounded authority.
2. **Salesforce-depth** — the operational depth (RBAC overrides, custom fields, custom views, customizable dashboards, plan-tier subscriptions, integration framework, audit) matches what serious sales orgs need from a CRM.

Agents do not replace humans. Agents accelerate humans, surface signals, and handle the high-volume, low-judgment work — under human supervision, with full audit trail, within strict permission scopes.

**What this product is NOT:**
- A legal-compliance tool (use Builtrix Legal Auditor)
- A property listing portal (no consumer-facing discovery)
- A general-purpose CRM (we are real-estate vertical, opinionated)
- A marketing-channel aggregator (use Builtrix MIH — separate repo)
- An autonomous AI sales agent that closes deals without humans (see Principle I)

---

## Core Principles

### I. Agents Are Colleagues, Not Autopilots

AI agents in this CRM are **first-class actors with bounded authority**. They have service accounts, explicit permissions, audit trails, and tier-graded action limits. No agent may take a Tier-3 or Tier-4 action without explicit human approval per action. No agent may exceed its assigned tier ceiling, ever.

Humans are the source of authority. Agents are the source of throughput.

**Rationale:** Real-estate transactions are high-stakes, regulated, and reputation-sensitive. An agent that books a unit, sends a contract, or reassigns a lead without human sign-off creates legal, financial, and brand exposure.

### II. Tenant Isolation Is Sacred

Cross-tenant data access is **architecturally impossible**, not policy-prevented. Row-Level Security enforced at the workspace level on every domain table. No service-role queries that span tenants without explicit, audited cross-org operations.

Channel partners, brokers, and external collaborators access scoped workspaces only — never the org's full data.

**Rationale:** A lead leak from one builder to another is a business-ending event. We design for "leak is impossible," not "leak is unlikely."

### III. Provenance Is Mandatory on Every Record

Every record in the database carries:
- `created_by` (user_id, agent_service_account_id, or system uuid)
- `created_via` (`manual` | `call_audit` | `whatsapp` | `email` | `api_sync` | `ai_extraction` | `import` | `cp_portal` | `mih_event`)
- `created_at`, `updated_at`, `updated_by`, `updated_via`
- `source_event_id` (FK to events table when applicable)
- `ai_confidence` (0–1, when record was AI-generated or AI-mutated)

Soft-delete only (`deleted_at`, `deleted_by`, `deleted_reason`). Physical deletion requires a documented retention-policy directive and runs only via scheduled jobs.

**Rationale:** Disputes happen. Channel partner claims a lead is theirs; agent makes a wrong status change; regulator asks how a contact was sourced. Without provenance, every dispute becomes a "trust me" argument. With provenance, it's a query.

### IV. Immutable Audit Trail

Every state-changing action — by humans, agents, or system — appends an immutable row to `audit_log`. Append-only at the database level (RLS forbids UPDATE/DELETE on `audit_log` for all roles including service_role; revisions appear as new rows with `supersedes` references).

Audit log is the single source of "who did what, when, why, and on what evidence."

**Rationale:** RERA-bound real-estate data may be subpoenaed. Internal disputes need resolution. AI agent decisions need post-hoc review.

### V. DOE Framework Compliance (Inherited from V5)

All development follows Directive → Orchestration → Execution. No code without a directive. No execution without orchestration. No deployment without verification. Plan Mode is the only human review checkpoint per V5.

Conversation context never overrides written artifacts. Constitution > policy > baseline > memory > directive > conversation.

### VI. Baseline Immutability (Inherited from V5)

Baseline documents — schemas, contracts, security foundations — are sacred. No feature may modify baseline without explicit migration directive. Baseline represents known-good state.

CRM-specific baselines that are immutable from V0:
- Multi-tenancy model (org/workspace/team/user)
- Graph + vector data model (`nodes`, `edges`, `node_signals`)
- Agent runtime contract (tier ceilings, audit log integration)
- Audit log schema
- Provenance fields contract
- Intelligent Canvas component contract
- Sister-product event bus contract

### VII. Stack Discipline

**Fixed stack — no exceptions, no parallel implementations:**

| Layer | Tech | Locked because |
|---|---|---|
| Frontend | Next.js 16 App Router + React 19 + TypeScript (strict) | V5 D-05 |
| Database | Supabase Postgres + RLS + pgvector | Tenant isolation + semantic search |
| Auth | Supabase Auth | RLS gets `auth.uid()` for free |
| Storage | Supabase Storage with signed URLs (no public buckets) | PII handling |
| Realtime | Supabase Realtime | Activity Stream on Canvas |
| Deploy | Vercel | V5 D-05 |
| UI kit | shadcn/ui + Tailwind CSS | V5 D-05 |
| Motion | Framer Motion | Canvas-grade UX |
| Cmd+K | `cmdk` library | NL command bar |
| Tests | Vitest (unit) + Playwright (e2e) | V5 D-05 |
| Background jobs | Inngest | Idempotent + observable |
| LLM | Anthropic Claude (default) + OpenAI (fallback) via internal Model Gateway | Provider portability |
| Embeddings | `text-embedding-3-small` (1536-dim) via Model Gateway | Cheap + good enough |
| STT (for Call Audit hand-off only) | Deepgram | TBD per Call Audit team |

Custom backends, alternative databases, framework mixing — **forbidden** without an amendment to this section.

**Rationale:** Solo founder. Stack fragmentation is a death sentence. One stack ships four products on the same rails.

### VIII. Single Source of Truth

Each piece of information has exactly one authoritative location:
- **Database schema** — authority for data structure
- **Constitution** (this doc) — authority for principles
- **Policy files** — authority for rules
- **Baselines** — authority for contracts
- **Prompts repo** (`src/prompts/<name>/v<N>.md`) — authority for agent behavior

No duplicated sources. No parallel docs that can drift.

### IX. Intelligent Canvas Is the Interface

The **Intelligent Canvas** is the primary UX surface — an adaptive document per node (lead, deal, contact, property, site visit, etc.). It is NOT a tab on a CRM; it IS the CRM.

Canvas constraints (binding):
- **No tabs.** Tabs are an admission that we couldn't decide what's primary. Use Cmd+K, sections, or canvas-of-canvases instead.
- **Progressive disclosure.** Show the 3 fields that matter *now*. Other fields accessible via "More" or Cmd+K.
- **Story over schema.** The canvas is a chronological narrative (Activity Stream), not a row in a table.
- **AI as a visible colleague.** Every agent action is visible on the canvas with name, tier badge (T0–T4), and audit link. No invisible "magic."
- **Action where the data lives.** Schedule a site visit by clicking on the canvas. Approve an agent draft inline. Never "go to Activities tab."
- **Cmd+K is the OS.** Every navigation, query, and action accessible from a single command bar.

**Rationale:** Sales reps reject CRMs that turn them into data-entry clerks. The Canvas surfaces what's needed *now*, hides what isn't, and makes AI work visible — solving the three failure modes of legacy CRMs (form fatigue, no memory, brittle automation) in one paradigm.

### X. NL-Compile-Then-Apply

Whenever the system uses natural language to mutate state — directive authoring, NL → SQL queries, prompt-to-schema, NL permissions — the pattern is:

1. **Compile** — LLM proposes a structured plan (action plan / SQL / migration / RLS diff)
2. **Verify** — static analyzer + RLS preservation check + tier-ceiling check
3. **Review** — human approves in Plan Mode (V5 Gate 2) or per-action UI
4. **Apply** — system executes; both NL and compiled artifact logged in `audit_log`
5. **Audit** — every NL operation reviewable in admin surface

**The LLM never directly mutates state.** It always produces a reviewable artifact.

**Rationale:** "AI did it" is not an audit trail. NL-Compile-Then-Apply gives us natural-language UX with machine-grade reproducibility.

### XI. Customization Is a First-Class Feature

Real-estate orgs have wildly different operating models. Hardcoding fields and dashboards is wrong. Org admins must self-serve customization within bounded layers:

- **L1 — Custom fields**: add fields to existing entities (Lead, Deal, Contact, Property). Stored as JSONB on entity. Available from V1.
- **L2 — Custom views**: define table views (columns, filters, sorts) per entity. Available from V1.
- **L3 — Custom entities**: define entirely new entity types. Deferred to V2 (post-V1 of product); requires 5+ org requests before building.
- **Custom dashboards**: drag-and-drop widget builder over saved queries. Available from V1.
- **Custom directives**: org admins author directives that compile to tier-bounded action plans. Available from V1.

Customization is **bounded by tier and permission** — not no-code-everything. Org admins customize within rails the constitution defines.

**Rationale:** Salesforce won by giving admins customization power. We give the same power, scoped to keep the Canvas paradigm clean and the security model intact.

---

## Agent Action Authority Tiers

**This is the operational core of Principle I. Every agent action maps to exactly one tier. Agent runtime enforces tier ceilings at the runtime layer, not in prompts.**

| Tier | Action Class | Examples | Authority Required |
|---|---|---|---|
| **T0 — Read** | Query data within agent's scoped workspace | Read leads/deals/calls; surface insights on canvas; flag stale leads | None. Logged. |
| **T1 — Internal Write** | Modify internal records that don't reach a third party | Update lead score, append call summary, tag activity, set internal status, create internal task | None per action. Logged with provenance. Reversible. |
| **T2 — External Communication (templated)** | Send pre-approved, template-based comms | Send site-visit reminder (template T-12), thank-you follow-up (T-08) | Pre-approved at template level by org admin. Per-message logged. Rate-limited. |
| **T3 — External Communication (generative) / Commercial Commitments** | AI-generated outbound, draft pricing, allocate units, modify deal terms | Custom WhatsApp reply, custom email pitch, draft offer letter, hold a unit, reassign lead between reps | **Per-action human approval required.** Agent drafts; human reviews and sends/commits. |
| **T4 — Irreversible / Cross-Org / Bulk** | Mass updates, bulk imports/exports, deletion, integration sync mutating external systems | Bulk lead import, mass status change, integration sync, soft-delete operations >100 records | **Org-admin approval + dry-run + audit pre-review.** Agent never executes T4 without explicit human-initiated trigger. |

**Hard rules:**
- An agent's max tier is set by its service account role at provisioning time. Cannot be elevated mid-session.
- Tier ceilings enforced at the agent runtime layer (`src/lib/agents/runtime.ts`), not in prompts. Prompts cannot grant elevation.
- Every T2/T3 action carries the approving human's `user_id` in the audit log: `audit_log.on_behalf_of`.

### Reference agent → tier mapping (V0/V1)

| Agent | Function | Tier |
|---|---|---|
| Lead Enrichment Agent | Enrich incoming lead, set intent score | T1 |
| Activity Stream Agent | Append touchpoints to canvas | T1 |
| Stale-lead Watcher | Flag leads silent > 14 days | T0 (read) + T1 (flag write) |
| Follow-up Agent | Send templated comms | T2 |
| Site Visit Reminder | 24h + 2h reminders | T2 |
| Custom Outbound Agent | AI-drafted custom WhatsApp/email | T3 |
| Cross-workspace lead reassign | Move lead between workspaces | T3 (dual approval) |
| Bulk lead import | CSV ingestion >100 leads | T4 |
| Bulk re-embedding | Recompute embeddings on schema change | T4 |
| Directive Compiler | Compile NL directive → action plan | T1 (writes a `directive_invocation` row pending review) |

---

## Multi-Tenancy Model

```
Org                   (e.g., "Lodha Group", "DLF Camellias")
 └── Workspace        (e.g., "Lodha Bangalore Sales", "DLF NCR Resale")
      └── Team        (e.g., "Inside Sales", "Site Visit Coordinators")
           └── User   (rep, manager, admin)
```

### Roles (RBAC)

| Role | Scope | Key Permissions |
|---|---|---|
| `super_admin` | Platform | Provisions orgs. ZERO operational access to any org's data. Lives on `/platform/*`. |
| `org_owner` | Org (all workspaces) | Everything within org including billing. |
| `org_admin` | Org (all workspaces) | All except billing. Account-management plane (NOT operational by default). Customizes org's CRM (dashboards, tables, roles, integrations, agents). |
| `workspace_admin` | One workspace | Manages users + agents within workspace. Approves T3 agent actions for workspace. |
| `manager` | One workspace + assigned teams | Read all in workspace. Write to assigned teams. Approves T3 actions for team. |
| `sales_rep` | One workspace + own pipeline | Read own + team. Write own. Cannot approve T3. |
| `read_only` | Configurable | Read-only access to assigned scope. |
| `channel_partner` | Specific workspace, scoped data | Submit leads, view own submissions. Cannot see other CPs' or org's leads. |
| `service_account_<agent>` | Specific workspace, tier-bounded | See *Agent Action Authority Tiers*. |

### Surface separation (middleware-enforced)

| Role | Allowed routes | Blocked routes | On violation |
|---|---|---|---|
| `super_admin` | `/platform/*`, `/api/auth/*` | `/dashboard/*`, `/admin/*`, `/settings/*` | Hard redirect to `/platform` |
| `org_admin` (account plane) | `/admin/*`, `/settings/*`, `/dashboard/*` (read-only by default) | `/platform/*` | Hard redirect to `/admin` |
| Operational roles | `/dashboard/*`, module pages permitted by RBAC | `/platform/*`, `/admin/*` | Hard redirect to `/dashboard` |
| `channel_partner` | Scoped subset of `/dashboard/*` (own leads only) | Everything else | Hard redirect or 403 |
| `agent_*` (service) | API surface only (no UI) | All UI routes | 401 |

Enforced in `src/middleware.ts` (single seam, edge runtime).

### Cross-workspace data flow

**Forbidden** at the application layer. Reports that aggregate across workspaces (e.g., org-level dashboards) run via service-role with explicit `org_id` boundary checks, audited.

### Channel partner isolation

A CP submitting leads to Workspace A cannot see leads in Workspace B even if both are in the same org, unless explicitly granted by `workspace_admin`.

### Three-layer permission resolution

```
effective_permissions(user, organization, workspace) =
    base_permissions(user.role)                              -- layer 1: TS literal in rbac.ts
    UNION   user_app_roles(user, organization, workspace)    -- layer 2: bridge table
    UNION   allow_overrides(role, organization)              -- layer 3a: per-org allow
    EXCEPT  deny_overrides(role, organization)               -- layer 3b: per-org deny
```

**Deny wins.** A permission can never be granted via override if it appears in `PLATFORM_ONLY_PERMISSIONS`.

---

## Operational Constraints

### Data Handling

- All call recordings, document uploads, ID proofs stored in **Supabase Storage with signed URLs, never public buckets**
- PII handling: GDPR-aligned + DPDP Act (India) aligned. Lead phone/email is PII; classified, masked in logs.
- No PII in `memory/logs/execution/` — IDs only. Mask phone/email/name in tool call logs.
- Document metadata is **immutable after creation**; new versions create new rows.
- AI processing results stored with full provenance (model name, prompt version, confidence, timestamp).

### Idempotency

- All event ingestion (call audio webhooks, WhatsApp webhooks, email sync, MIH events, Call Audit events) **must be idempotent** by `source_event_id`.
- Re-processing the same event must produce the same effect (or no effect if already processed).
- Background jobs use idempotency keys at queue level (Inngest).

**Rationale:** Telephony providers retry. WhatsApp webhooks duplicate. Without idempotency, a single inbound call generates three follow-up tasks.

### Agent Memory Isolation

- Each agent's working memory is scoped to its workspace + role + session.
- Agent A in Workspace X cannot recall context from Agent A's run in Workspace Y, even if same agent type.
- Pattern learnings (`memory/learned/<product-slug>/`) are per-product per V5; cross-product promotion requires manual review.

### Rate Limits & Cost Controls

- Per-agent, per-workspace, per-tier daily caps on T2 + T3 actions.
- Per-org monthly LLM token cap, configurable. Soft-warn at 80%, hard-stop at 100%.
- All LLM calls route through internal **Model Gateway** (`src/lib/ai/gateway.ts`).
- Two-level cost cap: super_admin sets plan-tier defaults; org_admin customizes within ceiling.

---

## Provenance & Audit Trail Schema

Every domain table inherits these fields (enforced via Postgres trigger or shared base type):

```
created_at        timestamptz NOT NULL
created_by        uuid NOT NULL          -- user_id OR agent_service_account_id OR system uuid
created_via       text NOT NULL          -- enum: manual | call_audit | whatsapp | email | api_sync | ai_extraction | import | cp_portal | mih_event
updated_at        timestamptz NOT NULL
updated_by        uuid NOT NULL
updated_via       text NOT NULL
source_event_id   uuid NULL              -- FK to events table when applicable
ai_confidence     numeric(3,2) NULL      -- 0.00–1.00, when AI was the source
deleted_at        timestamptz NULL
deleted_by        uuid NULL
deleted_reason    text NULL
```

`audit_log` table (separate, append-only):

```
id              uuid PK
ts              timestamptz
actor_id        uuid                     -- user OR agent_service_account
actor_type      text                     -- 'user' | 'agent' | 'system'
actor_role      text
on_behalf_of    uuid NULL                -- when agent acted on behalf of human (T2/T3)
workspace_id    uuid
table_name      text
record_id       uuid
action          text                     -- 'create' | 'update' | 'delete' | 'read_sensitive' | 'agent_action' | 'nl_query'
diff            jsonb                    -- before/after for updates
agent_tier      text NULL                -- T0 | T1 | T2 | T3 | T4
prompt_version  text NULL                -- when LLM call involved
nl_input        text NULL                -- raw NL when NL-Compile-Then-Apply
compiled_artifact jsonb NULL             -- compiled SQL/plan when NL-Compile-Then-Apply
reasoning       text NULL                -- agent's stated reason
supersedes      uuid NULL                -- self-FK for amendment chain
```

---

## Sister-Product Integration Contract

Builtrix Labs ships four products. The CRM is the spine. Integration is **event-bus based**, not direct API calls, for two reasons:

1. **Decoupling** — sister product downtime doesn't break the CRM
2. **Provenance** — every cross-product write is an event with a `source_event_id`

### Inbound to CRM (CRM consumes)

| Source | Event | What CRM does |
|---|---|---|
| Call Audit | `call.audited` | Creates `call` node attached to lead/deal; appends to Activity Stream; recompute intent score |
| Call Audit | `call.objection_detected` | Triggers directive D-09 (surface objection playbook on canvas) |
| Legal Auditor | `document.flagged` | Triggers directive D-13 (pause deal, notify) |
| Legal Auditor | `document.verified` | Updates `document` node state; surfaces on canvas |
| MIH (when connected) | `lead.qualified_attributed` | Creates lead node with attribution + intent score; triggers routing directive |

### Outbound from CRM (CRM emits)

| Event | Consumer | Why |
|---|---|---|
| `lead.created` | MIH | Cross-reference for attribution |
| `deal.booked` | PSCRM (post-sales), Legal Auditor | Hand-off |
| `site_visit.scheduled` | Calendar integrations | Sync to Google/Outlook |
| `node.updated` | Internal embedding refresh worker | Recompute embedding |

**No direct DB joins across products.** Each product owns its tables; cross-product reads use read-only views or events.

---

## RERA Compliance Scope — Explicit Claims & Non-Claims

**Builtrix CRM CLAIMS to provide:**
- Immutable audit trail of all communications, status changes, and AI actions on a lead/deal — **suitable as evidence** in RERA-related disputes.
- Provenance of every data point (where the lead came from, how the price was quoted, who approved each action).
- Soft-delete with retention windows aligned to RERA recordkeeping requirements (default: 5 years post-deal-close, configurable).
- Export formats compatible with regulator requests (audit logs, communication histories, document trails).

**Builtrix CRM EXPLICITLY DOES NOT CLAIM to provide:**
- Legal advice on RERA compliance (use Builtrix Legal Auditor)
- Automated RERA registration filing
- Determination of whether a specific transaction is RERA-compliant
- Advice on RERA disputes or litigation
- Substitute for legal review by qualified counsel

These distinctions are explicit because conflating them is a regulatory and liability minefield.

---

## Authority Order

When instructions conflict, follow this hierarchy strictly:

```
hook → constitution → policy → baseline → memory → learned patterns → directive → conversation
```

Hooks at the top: enforcement, not guidance. Conversation at the bottom: most volatile, least audited.

---

## Prohibited Patterns

- ❌ No code outside `src/` or `tests/`
- ❌ No direct database modifications outside `supabase/migrations/`
- ❌ No hardcoded credentials, API keys, or secrets — pre-commit + PreToolUse double-defense
- ❌ No client-side-only security checks
- ❌ No agent action that exceeds its tier ceiling
- ❌ No T3 or T4 agent actions without per-action human approval logged in `audit_log.on_behalf_of`
- ❌ No cross-workspace data joins in user-facing queries
- ❌ No physical deletion (always soft-delete)
- ❌ No PII (phone, email, name, ID numbers) in logs — IDs only
- ❌ No prompts that attempt to elevate agent tier ceilings
- ❌ No service-role queries that bypass RLS without an audited reason (logged with `read_sensitive`)
- ❌ No "temporary" permission workarounds — permissions changes go through migration
- ❌ No tabbed interfaces in operational surfaces (Canvas paradigm)
- ❌ No NL → DML at any user surface (NL-Compile-Then-Apply: SELECT only at runtime; mutations only through reviewable artifacts)
- ❌ No direct LLM calls outside the Model Gateway

---

## Governance

### Amendment Process

This constitution may be amended through:

1. Written directive proposing specific changes (`directives/<NNN>-constitution-amendment-<topic>.md`)
2. Impact assessment on existing features and agent behaviors
3. Version increment (semantic — MAJOR for breaking principle changes, MINOR for clarifications, PATCH for typos)
4. Documentation in `memory/decisions.md` with rationale
5. Sync impact report at top of file

### Compliance Review

Every Plan Mode review (V5 Gate 2) MUST verify:

- [ ] No constitution violations in proposed plan
- [ ] No baseline mutations without migration
- [ ] No security regressions
- [ ] All new agent actions are mapped to a tier
- [ ] All new tables include provenance fields
- [ ] All new mutations append to `audit_log`
- [ ] All new RLS policies enforce workspace boundary
- [ ] Any new UI surface uses Canvas paradigm (no tabs)
- [ ] Any NL state-mutation follows NL-Compile-Then-Apply

### Violation Response

Constitution violations result in:

1. Immediate halt of the violating action (V5 hooks block at PreToolUse where possible)
2. Clear report identifying the violated principle
3. Corrective guidance in Plan Mode rejection log
4. No merge until resolved

---

## Use With V5

- This file lives at `memory/constitution.md` in the CRM repo (Vibe Coding OS V5 reads it on session start).
- V5's Gate 1 (`directive-gen.sh`) reads this file plus `policy/` and `baseline/` to generate directives.
- V5's Gate 2 (Plan Mode) surfaces the relevant principles being touched by a proposed plan.
- Use `CLAUDE.md` for runtime development guidance (≤200 lines, V5 spec).

---

**Version**: 2.0.0 | **Ratified**: [DATE — fill on V0 D-040] | **Last Amended**: [DATE]
**Authoring trace**: Consolidated from CRM Constitution v1.0.0 + Builtrix-CRM-PRD-v1 + builtrix-ai-native-crm-prd-v1 (May 2026)
