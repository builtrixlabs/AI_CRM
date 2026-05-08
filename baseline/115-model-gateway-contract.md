# BASELINE 115 — Model Gateway + Agent Runtime Contract

**Version**: 1.0
**Effective Date**: 2026-05-08
**Authority**: D-009 directive (orchestration/009-model-gateway-and-lead-enrichment)
**Status**: Locked (immutable after creation per Constitution VI + POLICY 001 Rule 2)
**Authority Order**: constitution > policy > **baseline (this file)** > memory > directive > conversation

---

## Purpose

Defines the contract for every LLM completion + embedding the platform
issues, the per-org token budget, the agent service-account registry,
the agent runtime's tier-ceiling enforcement, and the prompt-versioning
store. Every later directive (D-010 Follow-up Agent T2, D-011 DOE
engine, D-012 Site Visit Reminder T2, D-013 Call Audit hand-off, D-014
hardening pass) builds on this contract.

To modify any part of this baseline, an amendment directive must:

1. Be authored under `directives/<NNN>-baseline-amendment-115-<topic>.md`.
2. Include impact assessment on every directive that has shipped after D-009.
3. Pass Plan Mode review.
4. Update this file in the same change.
5. Append the rationale to `memory/decisions.md`.

---

## I. Single seam — `src/lib/ai/gateway.ts`

**All LLM calls — every completion, every embedding, every fine-tune
or function-calling invocation — go through `gateway.complete()` or
`gateway.embed()`.**

This is Constitution-VII binding. Direct imports of the Anthropic or
OpenAI SDKs anywhere outside `src/lib/ai/providers/` are forbidden.
D-014 hardening adds an ESLint rule + a CI grep guard that fails the
build on direct provider imports.

The two entry points:

```ts
gateway.complete({
  prompt, system?, model_pref?: 'anthropic' | 'openai',
  organization_id, agent_id?, agent_tier?, request_id?, max_tokens?
}): Promise<CompleteResult>;

gateway.embed({
  text, organization_id, agent_id?, request_id?
}): Promise<EmbedResult>;
```

Both return a discriminated union: `{ ok: true, ... }` or
`{ ok: false, error: 'budget' | 'rate_limit' | 'parse' | 'network' | 'unknown', message }`.

Both throw `TokenBudgetExceededError` when the org's monthly cap is
hit. The error carries `{ organization_id, used, cap }` for audit-
friendly logging.

---

## II. Provider routing

**Completions:**
- **Default**: Anthropic `claude-sonnet-4-6` (locked at D-009).
- **Fallback**: OpenAI `gpt-4o-mini` on a single retry, triggered ONLY
  by `rate_limit`/`server`/`network` errors from the primary.
  Auth/parse/unknown errors do NOT trigger fallback (non-transient).
- `model_pref: 'openai'` flips the order (OpenAI primary, Anthropic
  fallback). Same retry rules.

**Embeddings:**
- **Default and only**: OpenAI `text-embedding-3-small` (1536-dim).
  Anthropic has no embedding model at the V0 cut. Adding an alternative
  embedding model is a baseline-amendment directive.

Provider modules live in `src/lib/ai/providers/`:
- `anthropic.ts` — wraps `@anthropic-ai/sdk` `messages.create`.
- `openai.ts` — wraps `openai` SDK `chat.completions.create` +
  `embeddings.create`.

Each provider returns the gateway's `ProviderCompleteResult` /
`ProviderEmbedResult` shape — coarse-grained `error` codes that the
gateway maps to user-facing codes.

---

## III. Token budget — per-org monthly cap

**`MONTHLY_TOKEN_CAP = 100_000`** (V0 hardcoded; D-014 wires plan-tier-
driven defaults). **`SOFT_WARN_RATIO = 0.8`**.

Cap enforcement:
1. Gateway pre-call check: SUM(`tokens_in + tokens_out`) for the org's
   current calendar month (UTC). If `used + estimated >= cap`, the
   gateway records a ledger row `status='error', error_code='budget'`
   AND throws `TokenBudgetExceededError`. The provider HTTP is NOT
   issued.
2. At ≥ 80% of cap, the gateway proceeds but the result includes
   `warnings: ['budget-80']`. Operator-facing UX surfaces this in a
   future cost dashboard (D-014).
3. Skipped entirely when `organization_id` is null (system-level
   calls). System calls still log to the ledger, just without org
   association.

The cap is a HARD cost-control rail, not a quota — operators who need
to raise it should do so via a per-org override column added in a
follow-up directive (V0 has no UI; D-014 introduces).

---

## IV. Token usage ledger — `token_usage_ledger`

Append-only via trigger (D-001.10 pattern; service-role bypasses RLS,
so RLS no-policy is insufficient). Schema:

```
id, organization_id (nullable), agent_id (nullable),
request_id, model_used, call_kind ('complete'|'embed'),
tokens_in, tokens_out, duration_ms, status ('ok'|'error'),
error_code, ts
```

Every gateway call writes ONE row, success or failure.

RLS: `org_admin` SELECTs own org via `app_org_id()`. `super_admin`
sees zero rows (operational data per Constitution II).

---

## V. Agent service accounts — `agent_service_accounts`

Global registry (one row per agent type; cross-org). Schema:

```
id (uuid), agent_type (unique), display_name, max_tier (enum),
prompt_version, created_at
```

Service-role only — no authenticated SELECT/INSERT/UPDATE policy.

A SEPARATE TS literal `AGENTS` in `src/lib/agents/registry.ts` tracks
the typed catalog. The agent_type in the DB row MUST match a `type`
in the catalog. Adding a new agent = (a) bump the catalog literal,
(b) seed a row via `scripts/seed-agent-service-accounts.sh`,
(c) register the handler.

V0 ships ONE agent: `lead_enrichment`, `max_tier='T1'`,
`prompt_version='v1'`.

---

## VI. Agent runtime — tier-ceiling enforcement

`runAgent(invocation, deps?)`:

1. Loads the `agent_service_accounts` row by `agent_id`.
2. Asserts `attempted_tier ≤ max_tier` via `withinCeiling()` (numeric
   rank: T0=0 < T1=1 < T2=2 < T3=3 < T4=4). On breach, **THROWS
   `TierCeilingExceededError`** — does not return a result. The throw
   is load-bearing: callers (Inngest functions, future server actions)
   must surface the error to the operator log.
3. Looks up the registered handler keyed by `${agent_type}:${action}`.
4. Dispatches; the handler is responsible for writing one
   `audit_log` row with the agent fields (`actor_type='agent'`,
   `agent_tier`, `prompt_version`, `reasoning`, `compiled_artifact`).

### Belt-and-suspenders: DB trigger on audit_log

A `BEFORE INSERT` trigger on `audit_log` rejects rows where
`agent_tier > service_account.max_tier`. Two-layer defense (D-007.9
precedent): runtime catches normal paths; trigger catches
service-role bypasses or future direct inserts.

The trigger uses `agent_tier_rank()` (T0..T4 → 0..4) for the
comparison; it skips non-agent rows (`actor_type <> 'agent'` OR
`agent_tier IS NULL`).

---

## VII. Prompt versioning — `src/prompts/<agent>/v<N>.md`

Constitution VIII names `src/prompts/<name>/v<N>.md` as the prompt
authority. D-009 ships:

```
src/prompts/lead-enrichment/v1.md
```

Bumping a prompt version = (a) write the new file, (b) bump
`prompt_version` in the `AGENTS` catalog literal AND in the
`agent_service_accounts` DB row (one-line UPDATE). Audit log carries
the active `prompt_version` on every agent row, so historical audits
map back to the exact prompt.

V1 prompts MUST instruct the model to (a) return JSON only,
(b) NOT echo PII (phone/email/full-name) in the rationale or any
free-text output.

---

## VIII. PII boundary — `textOfRecord(node)` masking

Embedding source text MUST be built via `src/lib/nodes/text.ts`
`textOfRecord(node)`. The function:

- Includes a per-node-type allowlist of safe-to-embed `data` keys
  (`source`, `state`, `city`, etc.).
- Drops every other `data` key — including `phone`, `email`, `notes`.
- Masks `phone`-like and `email`-like patterns inside the `label`
  field (sales reps occasionally type phone-as-label).
- Returns a deterministic flat string for embedding.

Agents that need PII for their prompt (Lead Enrichment Agent reads
`label` directly to score intent) read `nodes.data` directly, with
the trade-off documented per-agent. Such agents MUST NOT echo PII
in their `audit_log.compiled_artifact` or `reasoning` fields.

---

## IX. Inngest event triggers

Agents are triggered via Inngest events emitted by domain helpers
(`createLead` → `lead.created`, future: `deal.created`,
`call.audited`, `whatsapp.inbound`). The emitter is responsible for
the event SHAPE; the consumer (Inngest function) maps the event to
an agent invocation.

The emitter MUST:
- Fire the event AFTER the DB commit succeeds.
- Wrap `inngest.send(...)` in a try/catch — failure to enqueue logs
  but does NOT roll back the underlying mutation. The lead is
  persistent; enrichment is async + retry-able.

The Inngest function MUST:
- Be idempotent — agents check pre-state and no-op if already
  processed (D-009 lead-enrichment skips when `intent_score` is
  already set).
- Use `concurrency.limit` to bound provider rate-limit pressure.

---

## X. Forbidden patterns

- ❌ Direct imports of `@anthropic-ai/sdk` or `openai` outside
  `src/lib/ai/providers/`.
- ❌ Any path that hits a provider HTTP without going through
  `gateway.complete` / `gateway.embed`.
- ❌ Skipping the budget pre-check (would let an org silently exceed
  the cap).
- ❌ Skipping the ledger record on a successful provider call (audit
  loss).
- ❌ Including PII in `textOfRecord(node)` output (Constitution VII
  violation; the embedding text leaves the cluster via OpenAI).
- ❌ Agents writing to `audit_log` with `agent_tier > max_tier`.
  (Runtime + DB trigger both enforce; either layer catching is correct.)
- ❌ Running an agent action without writing an `audit_log` row.
- ❌ Loading prompt text from anywhere other than
  `src/prompts/<agent>/v<N>.md`. No DB-backed prompt store in V0.
- ❌ Re-prompting on parse failure within a single Inngest invocation
  (V0 logs + stops; V1 will gain self-correction).

---

## XI. References

- Constitution: `memory/constitution.md` (Principles I, IV, VI, VII).
- PRD: `docs/PRD.md` §11 D-010 (referenced as "D-009" in install-plan).
- Directive: `directives/009-model-gateway-and-lead-enrichment.md`.
- Plan Mode artifacts:
  `orchestration/009-model-gateway-and-lead-enrichment/{spec,plan,tasks}.md`.
- Migrations:
  - `supabase/migrations/20260508120000_agent_service_accounts.sql`
  - `supabase/migrations/20260508120100_token_usage_ledger.sql`
  - `supabase/migrations/20260508120200_audit_log_agent_tier_check.sql`
- Source code: `src/lib/ai/`, `src/lib/agents/`, `src/lib/nodes/text.ts`,
  `src/lib/inngest/functions/{lead-enrichment,embedding-refresh}.ts`.
- Tests: `tests/lib/ai/**`, `tests/lib/agents/**`,
  `tests/lib/inngest/**`, `tests/lib/nodes/text.test.ts`,
  `tests/integration/agent-tier-ceiling.test.ts`.
- Prompts: `src/prompts/lead-enrichment/v1.md`.

---

**END OF BASELINE 115 — locked at ratification 2026-05-08.**
