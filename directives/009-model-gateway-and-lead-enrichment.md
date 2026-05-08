# Directive 009 — Model Gateway V0 + Lead Enrichment Agent (T1)

**Kind:** feature
**Status:** AUTHORIZED — pending Plan Mode (Gate 2) review
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-009 + docs/PRD.md §11 D-010 + Constitution I, IV, VII
**Authority:** memory/constitution.md (Principles I bounded authority + tier ceilings, IV audit, VI baseline immutability — locks baseline 115, VII stack discipline + Model Gateway + token caps)
**Builds on:** D-001 (RLS + auth), D-002 (nodes + embedding_queue + Inngest stub), D-003 (RBAC), D-006 (canvas), D-007 (lead lifecycle + createLead), D-008 (Cmd+K)
**Stack:** branched off `feature/008-cmdk-bounded-catalog`. Will rebase to `v1` once the D-006 → D-007 → D-008 chain merges.

---

## Problem

Constitution VII names the **Model Gateway** as a stack-discipline-binding
contract: "All LLM calls route through internal Model Gateway
(`src/lib/ai/gateway.ts`)." Constitution I declares **agents are
first-class actors with bounded authority** — service accounts, tier
ceilings, audit trails — and lists a **Lead Enrichment Agent (T1)** as
the first one to ship. Constitution VII also locks **per-tenant token
caps** ("Soft-warn at 80%, hard-stop at 100%") via the gateway.

Today the codebase has:
- Zero LLM call paths (Constitution VII-violating once any agent ships).
- D-002's embedding refresh function that marks rows `deferred-d009`
  (named for THIS directive — wire-or-die).
- Lead nodes whose `intent_score` is always undefined (D-007 ships the
  Lead canvas with the field renderer, but no producer fills it).

D-009 closes all three:

1. **Model Gateway** (`src/lib/ai/gateway.ts`) — the single seam for
   every LLM completion and embedding the platform issues. Anthropic
   primary, OpenAI fallback on rate-limit / non-retryable errors. Every
   call is logged to a new `token_usage_ledger` table; pre-call check
   enforces a per-org monthly cap (warn at 80%, hard-stop at 100%).
2. **Agent runtime — minimum-viable** (`src/lib/agents/runtime.ts`).
   Tier ceiling enforcement + service-account dispatch. T1 only in V0;
   T2/T3 ship with their first agents (D-010, D-012, etc.).
3. **Lead Enrichment Agent (T1)** — the first agent. Triggered via
   Inngest on `lead.created` event (emitted by D-007's `createLead` after
   commit). Reads the lead, calls `gateway.complete(...)` with a
   versioned prompt to score intent (0-100), calls D-002's
   `updateNodeData` to set `intent_score`, writes one `audit_log` row
   with `actor_type='agent'`, `agent_tier='T1'`, `prompt_version='v1'`.
4. **Embedding refresh** (replacing D-002's deferred-d009 stub) —
   `gateway.embed(text)` calls `text-embedding-3-small` (OpenAI) and
   writes back to `nodes.embedding`. The Inngest function picks up
   pending rows and resolves them.
5. **`baseline/115-model-gateway-contract.md`** — locks gateway entry
   points, model defaults, fallback policy, token-ledger schema, agent-
   tier ceiling enforcement, and the prompt-versioning contract for
   future directives (D-010 Follow-up Agent, D-012 Site Visit
   Reminder, D-011 DOE engine).

---

## Success criteria

### Model Gateway

- [ ] **AC-1** `gateway.complete({ prompt, system?, model_pref?,
      organization_id, agent_id?, agent_tier, max_tokens? })` returns
      `{ text, model_used, tokens_in, tokens_out, duration_ms }` on
      success.
- [ ] **AC-2** Default provider is Anthropic; fallback to OpenAI on
      rate-limit / 5xx / network errors (one fallback attempt; total
      max two attempts).
- [ ] **AC-3** Every call writes one row to `token_usage_ledger`
      regardless of success/failure (failed calls log
      `tokens_in=0,tokens_out=0,error_code`).
- [ ] **AC-4** Pre-call cap check: `current_month_tokens(org_id) +
      estimated >= hard_cap` → throws `TokenBudgetExceededError`. No
      LLM HTTP issued.
- [ ] **AC-5** Soft-warn at 80% — call proceeds, result includes
      `warning: 'budget-80'`. Logged.
- [ ] **AC-6** `gateway.embed({ text, organization_id })` returns
      `{ vector: number[1536], model_used, tokens_in, duration_ms }`
      using `text-embedding-3-small` (OpenAI). Same ledger + cap
      enforcement.
- [ ] **AC-7** Server-only — `gateway.ts` imports `next/headers` /
      `process.env` and is unreachable from client bundles. Build
      verifies.

### Agent runtime (V0 minimum — T1 only)

- [ ] **AC-8** `agent_service_accounts` table seeded with one row:
      `{ id, agent_type='lead_enrichment', max_tier='T1',
      prompt_version='v1' }`.
- [ ] **AC-9** `runAgent({ agent_id, action, ... })` enforces the
      service-account's `max_tier`. Calling it with a higher-tier
      action throws `TierCeilingExceededError`. (T2+ paths exist as
      no-op stubs in V0; D-010 will populate them.)
- [ ] **AC-10** Each agent invocation writes ONE `audit_log` row with
      `actor_type='agent'`, `actor_id=<service_account_id>`,
      `agent_tier='T1'`, `prompt_version='v1'`, `reasoning=<short>`,
      and `compiled_artifact={ score, rationale }`.

### Lead Enrichment Agent (T1)

- [ ] **AC-11** D-007's `createLead` emits an Inngest event
      `lead.created { lead_id, organization_id, workspace_id }`
      after commit (additive; no contract break).
- [ ] **AC-12** A new Inngest function `lead-enrichment-on-create`
      consumes the event:
      a. Reads the lead via service-role.
      b. Calls `gateway.complete(...)` with the v1 enrichment prompt
         (`src/prompts/lead-enrichment/v1.md`).
      c. Parses the model output to a 0-100 integer
         (`intent_score`).
      d. Calls `updateNodeData` with `partial: { intent_score }`,
         `updated_by=<agent_service_account_id>`,
         `updated_via='ai_extraction'`.
      e. Writes the agent_action audit row (AC-10).
- [ ] **AC-13** A malformed model response (non-numeric, out-of-range,
      timeout) → agent records the failure in `audit_log` with
      `action='agent_action_failed'` + `reasoning=<error>`; lead's
      `intent_score` remains unchanged. No retry beyond Inngest's
      built-in retry policy (1 retry).
- [ ] **AC-14** `bypass=true` test mode lets unit tests run the agent
      without making real LLM calls (`gateway` accepts an injected
      mock).

### Embedding refresh (replacing the deferred-d009 stub)

- [ ] **AC-15** The existing Inngest function from D-002 (which marks
      rows `deferred-d009`) is replaced: it now calls
      `gateway.embed(text_of_record(node))`, writes the vector to
      `nodes.embedding`, and marks the queue row `done`.
- [ ] **AC-16** `text_of_record(node)` lives in
      `src/lib/nodes/text.ts` — extracts label + a stable subset of
      `data` (NEVER PII like phone/email; per Constitution VII).
      Unit-tested.
- [ ] **AC-17** A re-process of the same `node_id` is idempotent (the
      ledger has a unique key on `(node_id, embedding_version)`); the
      function's `step.run('embed', ...)` is a no-op on duplicate.

### Quality gates

- [ ] **AC-18** All untagged tests pass; D-001 → D-008 suites still green.
- [ ] **AC-19** Coverage ≥ 80 lines / ≥ 90 branches on
      `src/lib/ai/`, `src/lib/agents/`,
      `src/lib/inngest/functions/lead-enrichment.ts`,
      `src/lib/nodes/text.ts`.
- [ ] **AC-20** `npm run build` ✓.
- [ ] **AC-21** `baseline/115-model-gateway-contract.md` ratified —
      locks gateway entry points, model defaults, fallback policy,
      token-ledger schema, tier ceiling, prompt-versioning contract.

---

## Constraints

- **Constitution I (bounded authority).** The agent runtime enforces
  `max_tier` on every action. Prompts cannot grant tier elevation.
  T2/T3/T4 paths are stubs in V0; D-010 + later directives ship
  the actual T2/T3 agents.
- **Constitution III + IV.** Every state-changing agent call writes
  ONE audit row with full provenance (`actor_type='agent'`,
  `agent_tier`, `prompt_version`, `reasoning`, `compiled_artifact`).
  No agent action is silent.
- **Constitution VII (stack discipline).** All LLM calls go through
  `gateway.ts`. No direct `Anthropic` / `OpenAI` SDK imports outside
  the gateway. ESLint (or a directory-import rule) enforces this in
  D-014 hardening; for D-009 it's convention + a single grep test.
- **Constitution VII (PII handling).** `text_of_record(node)` MUST
  NOT include phone, email, or full-name fields when building the
  embedding source text. Mask before embedding (the embedded vector
  is searchable but the source text is what leaves the cluster
  via the OpenAI API).
- **Constitution II (tenant isolation).** Token ledger rows carry
  `organization_id`; cap is per-org. Agents act with service-role
  but every audit/ledger row carries the org_id of the operated-on
  resource. Cross-org agent action is impossible by construction
  (the Inngest event payload includes `organization_id` and is the
  ONLY field the agent uses to scope reads/writes).
- **Token budget defaults — V0 hardcoded.** Single global cap
  (e.g. 100K tokens / org / month). Plan-tier-driven defaults are
  D-014 hardening. Cap value lives in
  `src/lib/ai/budget.ts` as a constant.
- **Anthropic + OpenAI SDK installs** — `@anthropic-ai/sdk` and
  `openai` packages. First instances of either.
- **Env vars**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (operator
  populates `.env.local`; `.env.example` documents).
- **No streaming, no vision, no audio in V0.** Single-turn JSON
  responses only. Streaming is D-014+.
- **TDD per task** (V5 D-06).

---

## Out of scope (explicit non-goals)

- **Other agents** (Stale-lead Watcher T0/T1, Follow-up Agent T2,
  Site Visit Reminder T2, Custom Outbound Agent T3) — D-010, D-012,
  later directives.
- **T2/T3/T4 runtime paths** — V0 ships the tier-ceiling enforcement
  but only the T1 path runs in production. T2+ stubs exist as type
  guards.
- **Plan-tier-driven cap defaults** (starter / professional /
  enterprise mapping) — D-014 hardening. V0 uses a hardcoded global
  cap.
- **Cost dashboards** — D-014 (super_admin platform analytics).
- **Streaming completions** — V1.
- **Vision / audio** — V1+.
- **Multi-region routing / multiple Anthropic keys** — V1+.
- **Re-prompting on parse failure** — V0 logs the failure and stops;
  V1 does one-shot self-correction.
- **Background re-embedding on schema change** — explicitly listed
  as a T4 agent in Constitution; lands in D-014 hardening.
- **DOE engine integration** (compiled directives → tier-bounded
  action plans) — D-011.
- **NL → SQL / NL → Permissions** — Constitution X states the
  pattern; no implementation in D-009.
- **Prompt management UI** — V1+. V0 prompts live as files in
  `src/prompts/<agent>/v<N>.md`.
- **Per-prompt-version A/B routing** — V1+.

---

## Learned patterns applied

From `memory/learned/ai-crm/patterns.md`:

- **tenant-isolation-via-jwt-claim** (D-001) — agents act with
  service-role, but every read/write is constrained to the
  `organization_id` from the trigger event. Tests verify cross-org
  agent invocations would error.
- **caller-org-filter-on-service-role-mutation** (D-007.9) — the
  agent's `updateNodeData` call is preceded by a tenant-belt SELECT
  that confirms the lead's `organization_id` matches the event's
  `organization_id`. Same pattern as `assertLeadInTenant`.
- **provenance-as-not-null-columns** (D-001) — agent's writes set
  `updated_via='ai_extraction'`, `updated_by=<service_account_id>`,
  `ai_confidence=<0..1>`.
- **append-only-via-trigger** (D-001) — `token_usage_ledger` is
  append-only via a `BEFORE UPDATE/DELETE/TRUNCATE` trigger (same
  pattern as `audit_log`).
- **belt-and-suspenders-platform-only** (D-003) — agent's max_tier
  enforced at the runtime layer AND defended at the DB level via a
  CHECK constraint that rejects audit rows where
  `agent_tier > service_account.max_tier`.
- **inngest-job-stub-deferred** (D-002) — D-002 wrote the
  embedding-refresh as a stub marking rows `deferred-d009`; D-009
  REPLACES the function body. Same pattern; the queue contract
  doesn't change.
- **state-machine-as-pure-record** (D-007) — agent invocation states
  (`pending`/`running`/`success`/`failed`) — pure literal in
  `src/lib/agents/types.ts`.
- **bounded-command-catalog-literal** (D-008) — agent registry uses
  the same `as const` pattern: `AGENTS = [{ id, type, max_tier,
  prompt_version }] as const`.
- **node-data-as-jsonb-with-zod-validation** (D-002) — the agent's
  parsed model output is Zod-validated before passing to
  `updateNodeData`.
- **server-action-result-discriminated-union** (D-007) — the gateway
  returns `{ ok: true, ... } | { ok: false, error: 'budget' |
  'rate_limit' | 'parse' | 'network' | 'unknown', ... }`.

## Notes for Plan Mode (Gate 2)

- Spec / Plan / Tasks at `orchestration/009-model-gateway-and-lead-enrichment/`.
- Estimate: **XL** — 2 npm deps, 3 migrations, ~14 src files,
  ~13 test files, 1 baseline doc, ~5-7 sessions.
- Reviewer should confirm:
  1. **V0 scope is T1 only.** T2/T3/T4 paths are stubs in
     `runtime.ts`; D-010 + later directives populate them.
  2. **Anthropic primary + OpenAI fallback.** First install of both
     SDKs. Anthropic Claude is the default for completions; OpenAI
     `text-embedding-3-small` is the default for embeddings (Anthropic
     has no embedding model).
  3. **Token cap V0 = single hardcoded global value.** Plan-tier-
     driven mapping is D-014. OK?
  4. **Agent triggered via Inngest event** (`lead.created`) emitted
     by D-007's `createLead` AFTER the DB commit. Alternatives:
     Postgres trigger → LISTEN/NOTIFY → Inngest, or polling. Plan
     picks the event approach (simplest, idempotent via Inngest's
     `event_id`).
  5. **`text_of_record(node)` MUST mask PII.** D-009 ships the
     masking convention; future agents and embedding callers MUST
     route through this helper.
  6. **`token_usage_ledger` append-only via trigger** — same posture
     as `audit_log` (D-001.10). Service-role bypass needs trigger,
     not RLS.
  7. **`agent_service_accounts` is global, not per-org.** A single
     row per agent type. The agent acts on any org but writes carry
     the operated-on org's `organization_id`. Alternative: per-org
     rows seeded at provisioning (D-004). Plan picks global to avoid
     amending D-004's provisioning surface.
  8. **Prompt files in `src/prompts/<agent>/v<N>.md`** — Constitution
     VIII names this as the prompts repo. v1 only in D-009. Adding a
     prompt version = bump file + bump `prompt_version` in the
     agent registry literal.
  9. **OpenAI fallback path** — exercised in unit tests via mock
     (Anthropic mock throws → OpenAI mock returns). Production
     fallback runs once on rate-limit/5xx; no exponential backoff
     in V0.
  10. **Embedding-refresh function REPLACES D-002's stub.** Same
      function id (`embedding-refresh`), same trigger (`event` +
      `cron`), new body. Re-deploys atomic.
  11. **PII boundary review.** The model gateway sends prompt text
      to Anthropic / OpenAI. The Lead Enrichment Agent's prompt
      includes `label` (typically the lead's full name) — this is
      a Constitution-VII-aware decision: enrichment NEEDS the name
      to score intent meaningfully. Documented in baseline 115.
      Plan Mode should confirm.
  12. **Baseline 115 ratification.** Same path as D-002's baseline
      110 + D-006's baseline 112: drafted at end of Group D, written
      via the runbook hook-disable path, logged in
      `.claude/hooks/log/overrides.log`.
