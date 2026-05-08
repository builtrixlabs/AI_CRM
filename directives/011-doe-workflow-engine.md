# Directive 011 — DOE Workflow Engine V0 + 15 pre-built directives

**Kind:** feature
**Status:** AUTHORIZED — Plan Mode (Gate 2) approved (operator: assume-approve)
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-011 + docs/PRD.md §5.7 + Constitution V (DOE compliance) + Constitution X (NL-Compile-Then-Apply)
**Authority:** memory/constitution.md (Principles I tier ceiling, IV audit, V DOE, X NL-compile-then-apply)
**Builds on:** D-001..D-009 (auth, RBAC, nodes, agents, gateway), D-010 (whatsapp inbound — `D-09` directive consumes Call Audit-style objection events but the Call Audit producer lands in D-013).
**Stack:** branched off `v1` directly.

---

## Problem

Constitution V binds the entire framework to **Directive →
Orchestration → Execution**. Constitution X binds every
language-driven mutation to **NL-Compile-Then-Apply**. PRD §5.7
names a **DOE Workflow Engine** that turns event triggers into
tier-bounded actions, with 15 pre-built directives (D-01 through
D-15 in the PRD's catalog) shipping in V0.

Today the codebase has hard-coded triggers:
- `createLead` emits `lead.created` → Lead Enrichment Agent.
- (planned) WhatsApp webhook → Activity Stream.
- (planned) Site visit reminder cron.

Each is a one-off Inngest function. There's no central place to
say "when X happens, do Y," no per-org enable/disable, no audit
trail of *which directive fired*, no rate limiting, and no path
for org admins to author new ones (PRD §5.7's V1 promise).

D-011 ships:

1. **`directives` and `directive_invocations` tables.** Per-org
   rows that name an event trigger, action plan, tier, and
   enabled/disabled state. Every fire writes one
   `directive_invocations` row + one `audit_log` row with
   `directive_id`.
2. **DOE runtime** (`src/lib/doe/runtime.ts`). Pure function
   `dispatchDirective({ trigger, payload, organization_id })` that
   loads matching directives, evaluates conditions, and queues the
   action plan via the agent runtime (T0/T1/T2 only — T3 needs
   per-action approval; T4 is bulk-only).
3. **Action library** (`src/lib/doe/actions/*`). Small literal set
   of action kinds the V0 directives need: `surface_on_canvas`
   (T0 — write a `note` node), `flag_lead` (T1 — set state/data),
   `send_template_message` (T2 — uses D-010's path with template
   id), `notify_user` (T0), `attach_node` (T1).
4. **Trigger adapters** (`src/lib/doe/triggers/*`). Adapt incoming
   events to the runtime's `Trigger` shape. V0 covers:
   `lead.created`, `lead.state_changed`, `lead.idle_threshold`,
   `lead.intent_crossed`, `site_visit.window`,
   `deal.state_changed`, `cp.lead_submitted`,
   `mih.lead_pushed`, `legal.flag_raised`, `call.objection_detected`.
5. **Seed of 15 directives** (`supabase/migrations/20260508140100_seed_default_directives.sql`)
   — one row per PRD D-01..D-15 with global `organization_id=NULL`
   meaning "platform default; all orgs inherit unless they
   override." Per-org inheritance is implemented at runtime by
   UNION-ALL with `organization_id IS NULL OR
   organization_id=$caller`.
6. **Inngest scheduled job** (`/api/inngest`) that scans for
   schedule-driven triggers (`lead.idle_threshold`,
   `site_visit.window`) every 15 minutes.

---

## Success criteria

### Schema

- [ ] **AC-1** `directives` table with cols: `id`, `organization_id NULL`,
      `code` (e.g. `D-01`), `display_name`, `trigger_kind`,
      `trigger_config jsonb`, `action_kind`, `action_config jsonb`,
      `tier text`, `enabled bool`, full provenance.
- [ ] **AC-2** `directive_invocations` table append-only via
      trigger (D-001.10 pattern). Cols: `id`, `directive_id FK`,
      `organization_id`, `subject_node_id`, `outcome`, `details
      jsonb`, `ts`.
- [ ] **AC-3** RLS: SELECT scoped to `organization_id IS NULL OR
      organization_id = app_org_id()`. Writes via service-role.
- [ ] **AC-4** Seed migration inserts 15 platform-default rows
      (organization_id NULL) keyed by `code` D-01..D-15.

### Runtime

- [ ] **AC-5** `dispatchDirective({trigger, payload, organization_id})`
      loads matching enabled directives, runs each through
      `evaluateCondition + planActions`, dispatches via the agent
      runtime (T0/T1/T2 only — T3 returns a `pending_approval` row
      visible in the admin queue).
- [ ] **AC-6** Each invocation writes one `directive_invocations`
      row (`outcome` ∈ `dispatched|skipped_condition|skipped_disabled|
      failed_tier_ceiling|error`).
- [ ] **AC-7** Each successful dispatch writes one `audit_log` row
      with `action='directive_fired'`, `compiled_artifact={directive_id,
      trigger, action}`.

### Idempotency + rate limiting

- [ ] **AC-8** Per directive + subject_node_id + trigger_id, the
      runtime is idempotent — second dispatch with the same trigger
      id returns `skipped_idempotent` and does NOT fire actions.
- [ ] **AC-9** Per-org per-directive 24-hour rate limit: 100 fires
      max. Exceeding logs `outcome='rate_limited'`.

### Action library

- [ ] **AC-10** `surface_on_canvas` creates a `note` node attached
      to the subject lead with `data.kind='directive'` +
      `data.directive_code` (e.g. `D-09`). T0.
- [ ] **AC-11** `flag_lead` writes a partial update to the lead's
      `data` (`flagged_reason`, `flagged_at`). T1.
- [ ] **AC-12** `send_template_message` calls a stub `templateSend()`
      that just writes an `activity` node `kind='whatsapp'` with
      `data.template_id` and a structured body. T2 (real send is
      D-010's outbound counterpart, future directive).
- [ ] **AC-13** `notify_user` writes a `note` with `data.audience='user_id'`. T0.
- [ ] **AC-14** `attach_node` creates an `edge` between two existing nodes. T1.

### Tests + coverage

- [ ] **AC-15** Unit tests cover: every action handler, the runtime's
      condition eval, idempotency, rate limit, tier ceiling rejection.
- [ ] **AC-16** Coverage 80%/90% on `src/lib/doe/**`.

---

## Non-goals

- The org_admin authoring UI (`/admin/directives`). Visible in
  the existing placeholder route — D-011 only seeds defaults.
  Custom NL authoring lands V1.
- Real outbound WhatsApp send. Templated send writes an activity
  node so the canvas shows the message; outbound to a provider is
  D-016 / D-017.
- T3 approval queue UI. The runtime stamps `pending_approval`
  rows; the queue surface is V1.
