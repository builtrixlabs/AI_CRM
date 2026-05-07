<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0 (MAJOR — Initial CRM constitution)
Source product: Builtrix AI-Native CRM (Real Estate)
Built on: Vibe Coding OS V5
Replaces: Legal Compass constitution (V4 era)

Modified principles: All (new product, new domain)
Added sections:
  - Core Principles (8 — added "Agents Are Colleagues, Not Autopilots")
  - Agent Action Authority Tiers (new framework)
  - Multi-Tenancy Model (Org → Workspace → Team → User)
  - Provenance & Audit Trail
  - RERA Compliance Scope (with explicit non-claims)
  - Stack Discipline

Templates requiring updates:
  - ✅ spec-template.md (compatible — entity placeholders carry over)
  - ✅ plan-template.md (compatible)
  - ⚠️ tasks-template.md (review for agent-tier tagging)

Follow-up TODOs:
  - Domain model doc (orgs/workspaces/leads/deals/properties/activities/calls) — Days 4–7
  - Agent runtime architecture — Days 8–11
  - RERA evidence export format — separate baseline
-->

# Builtrix AI-Native CRM Constitution

**Product:** Builtrix CRM — AI-native real-estate sales & post-sales workforce
**Stack OS:** Vibe Coding OS V5
**Authority:** Constitutional — supersedes all directives, conversation, learned patterns. Cannot be overridden by Claude or operator without amendment.

---

## Preamble — What This Product Is

Builtrix CRM is a **multi-tenant SaaS for Indian real-estate organizations** (builders, brokerages, channel-partner networks). It captures, qualifies, and progresses leads from first-touch through booking and post-sales — and runs **AI agents as workforce members** alongside human sales staff: lead-enrichment agents, follow-up agents, call-audit agents (integrated with sister product Builtrix Call Audit), and post-sales nudge agents.

Agents do not replace humans. Agents accelerate humans, surface signals, and handle the high-volume, low-judgment work — under human supervision, with full audit trail, within strict permission scopes.

**What this product is NOT:**
- A legal-compliance tool (use Builtrix Legal Auditor)
- A property listing portal (consumer-facing discovery is out of scope)
- A general-purpose CRM (we are real-estate vertical, opinionated)
- An autonomous AI sales agent that closes deals without humans (see Principle I)

---

## Core Principles

### I. Agents Are Colleagues, Not Autopilots

AI agents in this CRM are **first-class actors with bounded authority**. They have service accounts, explicit permissions, audit trails, and tier-graded action limits (see *Agent Action Authority*, below). No agent may take a Tier-3 or Tier-4 action without explicit human approval per action. No agent may exceed its assigned tier ceiling, ever.

Humans are the source of authority. Agents are the source of throughput.

**Rationale:** Real-estate transactions are high-stakes, regulated, and reputation-sensitive. An agent that books a unit, sends a contract, or refunds a deposit without human sign-off creates legal, financial, and brand exposure. Throughput without authority is a liability.

### II. Tenant Isolation Is Sacred

Cross-tenant data access is **architecturally impossible**, not policy-prevented. Row-Level Security enforced at the workspace level. No service-role queries that span tenants without explicit, audited cross-org operations (e.g., Builtrix-internal aggregations, never user-facing).

Channel partners, brokers, and external collaborators access scoped workspaces only — never the org's full data.

**Rationale:** A lead leak from one builder to another is a business-ending event. We design for "leak is impossible," not "leak is unlikely."

### III. Provenance Is Mandatory on Every Record

Every record in the database carries:
- `created_by` (user_id, agent_id, or system)
- `created_via` (manual | call_audit | whatsapp | email | api_sync | ai_extraction | import)
- `created_at`, `updated_at`, `updated_by`, `updated_via`
- `source_event_id` (foreign key to event log, when applicable)
- `ai_confidence` (0–1, when record was AI-generated or AI-mutated)

Soft-delete only (`deleted_at`, `deleted_by`, `deleted_reason`). Physical deletion requires a documented retention-policy directive and runs only via scheduled jobs.

**Rationale:** Disputes happen. Channel partner claims a lead is theirs; agent makes a wrong status change; regulator asks how a contact was sourced. Without provenance, every dispute becomes a "trust me" argument. With provenance, it's a query.

### IV. Immutable Audit Trail

Every state-changing action — by humans, agents, or system — appends an immutable row to `audit_log`. Append-only at the database level (RLS forbids UPDATE/DELETE on `audit_log` for all roles including service_role; revisions appear as new rows with `supersedes` references).

Audit log is the single source of "who did what, when, why, and on what evidence."

**Rationale:** RERA-bound real-estate data may be subpoenaed. Internal disputes need resolution. AI agent decisions need post-hoc review. The audit log is non-negotiable infrastructure.

### V. DOE Framework Compliance (Inherited from V5)

All development follows Directive → Orchestration → Execution. No code without a directive. No execution without orchestration. No deployment without verification. Plan Mode is the only human review checkpoint per V5.

Conversation context never overrides written artifacts. Constitution > policy > baseline > memory > directive > conversation.

### VI. Baseline Immutability (Inherited from V5)

Baseline documents — schemas, contracts, security foundations — are sacred. No feature may modify baseline without explicit migration directive. Baseline represents known-good state.

CRM-specific baselines that are immutable from v1:
- Domain model (org/workspace/lead/deal/property/activity/call)
- Agent runtime contract
- Audit log schema
- Provenance fields contract

### VII. Stack Discipline

**Fixed stack — no exceptions, no parallel implementations:**
- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Supabase: Postgres + Auth + Storage + Realtime + RLS + pgvector
- Vercel (deploy + preview)
- shadcn/ui + Tailwind CSS
- Vitest (unit) + Playwright (e2e)
- Inngest or Trigger.dev for background jobs (TBD in event-bus baseline)
- LLM: Anthropic Claude as default, OpenAI as fallback (via internal model gateway)
- STT: TBD in agent runtime baseline (Deepgram | AssemblyAI | Whisper)

Custom backends, alternative databases, framework mixing — **forbidden** without an amendment to this section.

**Rationale:** Solo founder. Stack fragmentation is a death sentence. One stack lets you ship four products on the same rails.

### VIII. Single Source of Truth

Each piece of information has exactly one authoritative location:
- **Database schema** — authority for data structure
- **Constitution** (this doc) — authority for principles
- **Policy files** — authority for rules
- **Baselines** — authority for contracts
- **Prompts repo** (`src/prompts/<name>/v<N>.md`) — authority for agent behavior

No duplicated sources. No parallel docs that can drift. If you find drift, the version with the higher authority wins; the lower one gets deleted.

---

## Agent Action Authority Tiers

**This is the operational core of Principle I. Every agent action maps to exactly one tier. Agent runtime enforces tier ceilings.**

| Tier | Action Class | Examples | Authority Required |
|---|---|---|---|
| **T0 — Read** | Query data within agent's scoped workspace | Read leads, deals, calls, activities; generate summaries; surface insights | None. Logged. |
| **T1 — Internal Write** | Modify internal records that don't reach a third party | Update lead score, append call summary to lead, tag activity, set internal status, create internal task | None per action. Logged with provenance. Reversible. |
| **T2 — External Communication (templated)** | Send pre-approved, template-based comms to leads/customers | Send site-visit reminder (template T-12), send "thank you for visiting" follow-up (template T-08) | Pre-approved at template level by org admin. Per-message logged. Rate-limited. |
| **T3 — External Communication (generative) / Commercial Commitments** | Send AI-generated outbound, draft pricing, allocate units, modify deal terms | Custom WhatsApp reply, custom email pitch, draft offer letter, hold a unit, reassign a lead from one rep to another | **Per-action human approval required.** Agent drafts, human reviews, human sends/commits. |
| **T4 — Irreversible / Cross-Org / Bulk** | Mass updates, bulk imports/exports, integration sync that mutates external systems, anything affecting >100 records | Bulk lead import, mass status change, integration sync to external CRM, deletion operations | **Org-admin approval + dry-run + audit pre-review.** Agent never executes T4 without explicit human-initiated trigger. |

**Hard rules:**
- An agent's max tier is set by its service account role at provisioning time. Cannot be elevated mid-session.
- Tier ceilings are enforced at the agent runtime layer, not in prompts. Prompts cannot grant elevation.
- Every T2/T3 action carries the approving human's user_id in the audit log. "Agent acted on behalf of [Human X]."

---

## Multi-Tenancy Model

```
Org                   (e.g., "Lodha Group", "DLF Camellias")
 └── Workspace        (e.g., "Lodha Bangalore Sales", "DLF NCR Resale")
      └── Team        (e.g., "Inside Sales", "Site Visit Coordinators")
           └── User   (rep, manager, admin)
```

**Roles (RBAC):**

| Role | Scope | Key Permissions |
|---|---|---|
| `org_owner` | Org (all workspaces) | Everything within org. Manages billing, workspaces, integrations, agent provisioning. |
| `org_admin` | Org (all workspaces) | All except billing. Manages users, agents, RBAC. |
| `workspace_admin` | One workspace | Manages users + agents within workspace. Approves T3 agent actions for their workspace. |
| `manager` | One workspace + assigned teams | Read all in workspace. Write to assigned teams. Approves T3 actions for their team. |
| `sales_rep` | One workspace + own pipeline | Read own + team. Write own. Cannot approve T3 actions (only requests them). |
| `read_only` | Configurable | Read-only access to assigned scope. No writes. No approvals. |
| `channel_partner` | Specific workspace, scoped data | Submit leads, view own submitted leads + own commission. Cannot see other CPs' leads. |
| `service_account_<agent>` | Specific workspace, tier-bounded | See *Agent Action Authority Tiers*. |

**Cross-workspace data flow:** **forbidden** at the application layer. Reports that aggregate across workspaces (e.g., org-level dashboards) run via service-role with explicit `org_id` boundary checks, audited.

**Channel partner isolation:** A CP submitting leads to Workspace A cannot see leads in Workspace B even if both are in the same org, unless explicitly granted by `workspace_admin`.

---

## Operational Constraints

### Data Handling

- All call recordings, document uploads, ID proofs stored in **Supabase Storage with RLS-equivalent policies** (signed URLs, never public buckets)
- PII handling: GDPR-aligned + DPDP Act (India) aligned. Lead phone/email is PII; classified, masked in logs.
- No PII in `memory/logs/execution/` — IDs only. Mask phone/email/name in tool call logs.
- Document metadata is **immutable after creation**; new versions create new rows.
- AI processing results stored with full provenance (model name, prompt version, confidence, timestamp).

### Idempotency

- All event ingestion (call audio webhooks, WhatsApp webhooks, email sync) **must be idempotent** by `source_event_id`.
- Re-processing the same event must produce the same effect (or no effect if already processed).
- Background jobs use idempotency keys at queue level.

**Rationale:** Telephony providers retry. WhatsApp webhooks duplicate. Without idempotency, a single inbound call generates three follow-up tasks.

### Agent Memory Isolation

- Each agent's working memory is scoped to its workspace + role + session.
- Agent A in Workspace X cannot recall context from Agent A's run in Workspace Y, even if same agent type.
- Pattern learnings (`memory/learned/<product-slug>/`) are per-product per V5; cross-product promotion requires manual review.

### Rate Limits & Cost Controls

- Per-agent, per-workspace, per-tier daily caps on T2 + T3 actions.
- Per-org monthly LLM token cap, configurable. Soft-warn at 80%, hard-stop at 100%.
- All LLM calls route through internal model gateway (see model-gateway baseline, Days 15–17).

---

## Provenance & Audit Trail Schema

Every domain table inherits these fields (will be enforced via Postgres trigger or shared base type):

```
created_at        timestamptz NOT NULL
created_by        uuid NOT NULL          -- user_id OR agent_service_account_id OR system uuid
created_via       text NOT NULL          -- enum: manual | call_audit | whatsapp | email | api_sync | ai_extraction | import
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
action          text                     -- 'create' | 'update' | 'delete' | 'read_sensitive' | 'agent_action'
diff            jsonb                    -- before/after for updates
agent_tier      text NULL                -- T0 | T1 | T2 | T3 | T4 (when actor_type = 'agent')
prompt_version  text NULL                -- when agent action involved LLM call
reasoning       text NULL                -- agent's stated reason (when applicable)
supersedes      uuid NULL                -- self-FK for amendment chain
```

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

Hooks are at the top because they execute before any prompt-following — they're enforcement, not guidance. Conversation is at the bottom because it's the most volatile and least audited input.

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
- ❌ No service-role queries that bypass RLS without an audited reason (logged in `audit_log` with `read_sensitive`)
- ❌ No "temporary" permission workarounds — permissions changes go through migration

---

## Governance

### Amendment Process

This constitution may be amended through:

1. Written directive proposing specific changes (`directives/<NNN>-constitution-amendment-<topic>.md`)
2. Impact assessment on existing features and agent behaviors
3. Version increment (semantic — MAJOR for breaking principle changes, MINOR for clarifications, PATCH for typos)
4. Documentation in `memory/decisions.md` with rationale
5. Sync impact report at top of file (see header of this doc)

### Compliance Review

Every Plan Mode review (V5 Gate 2) MUST verify:

- [ ] No constitution violations in proposed plan
- [ ] No baseline mutations without migration
- [ ] No security regressions
- [ ] All new agent actions are mapped to a tier
- [ ] All new tables include provenance fields
- [ ] All new mutations append to `audit_log`
- [ ] All new RLS policies enforce workspace boundary

### Violation Response

Constitution violations result in:

1. Immediate halt of the violating action (V5 hooks block at PreToolUse where possible)
2. Clear report identifying the violated principle
3. Corrective guidance in Plan Mode rejection log
4. No merge until resolved

---

## Use With V5

- This file lives at `.specify/memory/constitution.md` in the CRM repo (replacing the Legal Compass version inherited from V4 scaffold).
- V5's Gate 1 (`directive-gen.sh`) reads this file plus `policy/` and `baseline/` to generate directives.
- V5's Gate 2 (Plan Mode) surfaces the relevant principles being touched by a proposed plan.
- Use `CLAUDE.md` for runtime development guidance (≤200 lines, V5 spec).

---

**Version**: 1.0.0 | **Ratified**: [DATE — fill on Day 19] | **Last Amended**: [DATE]
**Authoring trace**: Built parallel to Vibe OS V5 implementation (May 2026)
