# Tasks — 009-model-gateway-and-lead-enrichment

Ordered for TDD execution. Estimated working sessions: **5-7**.

---

## Group A — migrations + budget + ledger + node text helper

### A1. [migration] agent_service_accounts + agent_tier enum

- `supabase/migrations/20260508120000_agent_service_accounts.sql`.
- `agent_tier` enum + table + RLS (service-role only) + seed support.
- Seed script: `scripts/seed-agent-service-accounts.sh` (idempotent).

### A2. [migration] token_usage_ledger

- `supabase/migrations/20260508120100_token_usage_ledger.sql`.
- Append-only via trigger (D-001.10 pattern).
- Index on `(organization_id, ts DESC)` for monthly SUM queries.
- RLS: org_admin SELECTs own org via `app_org_id()`.

### A3. [migration] audit_log agent_tier check trigger

- `supabase/migrations/20260508120200_audit_log_agent_tier_check.sql`.
- Trigger rejects audit rows where `agent_tier > service_account.max_tier`.

### A4. [unit] textOfRecord helper + PII masking

- `src/lib/nodes/text.ts`. Test: phone/email/full-name dropped;
  source/state/city retained; deterministic output.

### A5. [unit] MONTHLY_TOKEN_CAP constants + currentMonthTokens

- `src/lib/ai/budget.ts`. Mocked client SUM-returning shape; month-
  bounded.

### A6. [unit] checkBudget — ok/warn/exceeded

- Combinations: empty ledger, 50%, 80%, 100%, 110%.

### A7. [unit] recordCall ledger insert

- `src/lib/ai/ledger.ts`. Asserts shape on success + error rows.

### Commit checkpoint A

- [ ] All A tests pass; `supabase db push` ✓ on local.
- [ ] Commit: `feat(ai): migrations + budget + ledger + node text masking (D-009 group A)`

---

## Group B — Model Gateway

### B1. [setup] Install Anthropic + OpenAI SDKs

- `npm install @anthropic-ai/sdk openai`.
- Verify `npm run build` ✓.
- Add `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` to `.env.example`.

### B2. [unit] anthropic.ts provider wrapper

- Mocked Anthropic SDK; happy path + 429 rate-limit + 5xx + network
  paths return the normalized shape.

### B3. [unit] openai.ts provider wrapper

- Mocked OpenAI SDK; same shape; supports BOTH chat + embeddings.

### B4. [unit] gateway.complete

- Budget check first → call Anthropic → on rate-limit/5xx, fall back
  to OpenAI → ledger row written for each path. TokenBudgetExceededError
  thrown when budget exceeded BEFORE any provider call.

### B5. [unit] gateway.embed

- OpenAI embeddings only; same budget + ledger contract.

### B6. [unit] gateway: parse failures, network errors, soft-warn at 80%

- Each error path returns the typed `{ ok: false, error: ... }`
  result; soft-warn includes `warnings: ['budget-80']`.

### Commit checkpoint B

- [ ] All B tests pass; `npm run build` ✓.
- [ ] Commit: `feat(ai): Model Gateway with Anthropic+OpenAI fallback + token cap (D-009 group B)`

---

## Group C — Agent runtime + Lead Enrichment Agent + Inngest wiring

### C1. [unit] agent registry literal

- `src/lib/agents/registry.ts`. Single entry: `lead_enrichment`,
  `max_tier='T1'`, `prompt_version='v1'`. ID-uniqueness test.

### C2. [unit] runAgent — tier ceiling enforcement

- A T2 attempt on a T1-only agent throws `TierCeilingExceededError`.
- T0/T1 succeed; runtime writes one audit_log row per call with
  `agent_tier`, `prompt_version`, `reasoning`, `compiled_artifact`.

### C3. [unit] enrichLead

- Mocked gateway returning `{ ok: true, text: '{"score": 72, "rationale": "..."}' }`
  → updateNodeData called with `partial: { intent_score: 72 }` +
  agent service-account id as `updated_by`.
- Malformed model output → no node update; audit row records
  `action='agent_action_failed'`, `reasoning=<parse error>`.
- Already-scored lead (intent_score present) → no-op (idempotent).
- Cross-tenant safety: agent reads via service-role + asserts
  `lead.organization_id === args.organization_id` (defense-in-
  depth, same as D-007.9).

### C4. [unit] prompt v1

- `src/prompts/lead-enrichment/v1.md`. The file's text is checked
  into a unit test that asserts: includes `{score:` + `{rationale:`
  hints; doesn't include unmasked-PII placeholders; ≥ 5 lines for
  rubric stability.

### C5. [unit] Inngest function wires the agent

- `src/lib/inngest/functions/lead-enrichment.ts`. Mocked
  `runAgent`; consumed `lead.created` event triggers
  `runAgent({ action: 'enrich_lead', ... })`.

### C6. [unit] Inngest event emitted from createLead

- `src/lib/leads/api.ts` extended; mocked `inngest.send`. After
  successful `createNode`, `inngest.send({ name: 'lead.created',
  data: ... })` is called. Send failure logged but doesn't roll back
  the lead insert.

### C7. [unit] Replace embedding-refresh stub with real gateway.embed

- `src/lib/inngest/functions/embedding-refresh.ts`. Mocked gateway
  returning a 1536-vector → vector written to `nodes.embedding`,
  queue row marked `done`.

### Commit checkpoint C

- [ ] All C tests pass.
- [ ] Commit: `feat(agents): Lead Enrichment Agent (T1) + tier-bounded runtime + embedding-refresh wiring (D-009 group C)`

---

## Group D — integration + e2e + memory + baseline 115 + verify + push + PR

### D1. [integration] agent-tier-ceiling — DB belt

- Seed an agent with max_tier='T1'; INSERT into audit_log with
  `agent_tier='T2'` → trigger raises. Belt-and-suspenders.

### D2. [integration] lead-enrichment-flow — full path against real DB

- Seed a sales_rep + workspace; createLead via the real action;
  the Inngest event fires (we await directly, not via Inngest's
  worker — call `runAgent` synchronously in the test); assert
  `intent_score` is set on the lead, an `audit_log` row with
  `actor_type='agent', agent_tier='T1', prompt_version='v1'` exists,
  and a `token_usage_ledger` row exists. Mock gateway via env-flag.

### D3. [integration] token-budget-exceeded

- Seed `token_usage_ledger` to MONTHLY_TOKEN_CAP for an org; call
  `gateway.complete` with that org → `TokenBudgetExceededError`.
  The ledger has the rejected call as `status='error',
  error_code='budget'`.

### D4. [e2e@smoke] lead-enrichment-end-to-end

- Sign in as sales_rep; Cmd+K → "Create new lead"; submit (mocked
  gateway returns deterministic 70). Wait up to 30s; assert
  `intent_score=70` rendered on the canvas.

### D5. [doc] memory updates

- `memory/decisions.md`:
  - D-009.1 Single Model Gateway seam (Constitution VII)
  - D-009.2 Anthropic primary + OpenAI fallback (single retry)
  - D-009.3 Token cap V0 hardcoded; plan-tier-driven D-014
  - D-009.4 Lead Enrichment Agent triggered via Inngest event
  - D-009.5 PII masking in `textOfRecord` for embeddings
  - D-009.6 Tier ceiling enforced in runtime AND DB trigger (belt-and-suspenders)
  - D-009.7 Prompt files in `src/prompts/<agent>/v<N>.md`
  - D-009.8 Embedding-refresh body replaced (D-002 stub closed out)
  - D-009.9 Stacked PR off feature/008
- `memory/learned/ai-crm/patterns.md`:
  - `single-llm-seam-via-gateway`
  - `provider-fallback-with-typed-error-discrimination`
  - `append-only-ledger-via-trigger` (reinforces D-001's pattern)
  - `agent-tier-ceiling-belt-and-suspenders`
  - `pii-masking-before-embedding`
  - `inngest-event-emit-after-commit`

### D6. [doc] baseline 115 ratification

- `baseline/115-model-gateway-contract.md`. Locks: gateway entry
  points, model defaults, fallback policy, ledger schema, tier
  ceiling, prompt-versioning, PII-masking rule. Ratified via
  hook-disable runbook (same path as baseline 110 / 112).

### D7. [verify] V5 Gate 4

- `npm run test`, `npm run test:integration`, `npm run test:smoke`,
  `npm run build`. Coverage ≥ 80 / ≥ 90.

### D8. [security] Gate 4 scan

- security-scanner agent. Focus: tenant-isolation in agent path
  (cross-org event payload); secret handling (API keys never logged
  to ledger or audit; ledger redacts); prompt-injection surface
  (v1 prompt review).

### D9. [deploy] preview

- Push triggers Vercel.

### D10. [merge] PR

- `gh pr create --base feature/008-cmdk-bounded-catalog --head feature/009-model-gateway-and-lead-enrichment`.
- Retarget to `v1` after the D-006 → D-007 → D-008 chain merges.

---

## Commit cadence

| Checkpoint | Commit message |
|---|---|
| A | `feat(ai): migrations + budget + ledger + node text masking (D-009 group A)` |
| B | `feat(ai): Model Gateway with Anthropic+OpenAI fallback + token cap (D-009 group B)` |
| C | `feat(agents): Lead Enrichment Agent (T1) + tier-bounded runtime + embedding-refresh wiring (D-009 group C)` |
| D | `feat(ai): integration + baseline 115 + memory (D-009 group D)` |

Final PR title: `feat: D-009 Model Gateway V0 + Lead Enrichment Agent (T1) + baseline 115`

---

## Reviewer questions for Plan Mode

1. **V0 scope is T1 only.** T2/T3/T4 paths exist as runtime stubs +
   audit-tier check; production traffic only flows through T1 in V0.
2. **Anthropic primary + OpenAI fallback (single retry).** Embedding
   model is OpenAI's `text-embedding-3-small` (Anthropic has no
   embedding API yet). OK?
3. **Token cap hardcoded to 100K/month/org.** Plan-tier-driven
   defaults are D-014. OK?
4. **Lead Enrichment trigger via Inngest event** (`lead.created`)
   emitted after `createLead` commits. Alternatives: DB trigger →
   LISTEN/NOTIFY, or polling. Plan picks event approach. OK?
5. **`text_of_record` masks PII** before embedding (phone/email/full-
   name dropped). Future agents that need PII (Lead Enrichment
   itself) read from `nodes.data` directly, with the trade-off
   documented in baseline 115. OK?
6. **Tier ceiling enforced at TWO layers:** runtime (`runAgent`) +
   DB trigger on `audit_log` (joins `agent_service_accounts`).
   Belt-and-suspenders per D-007.9 precedent. OK?
7. **`agent_service_accounts` is GLOBAL** (one row per agent type
   shared across all orgs). The agent operates on any org but every
   audit/ledger row carries the operated-on `organization_id`.
   Alternative: per-org service-account rows seeded at provisioning
   (D-004 amendment). Plan picks global to avoid amending D-004's
   provisioning. OK?
8. **Prompt files in `src/prompts/<agent>/v<N>.md`** per Constitution
   VIII. v1 only in D-009. Bumping a prompt version = new file +
   agent registry literal bump. OK?
9. **OpenAI fallback is exercised in unit tests via mock.** Real
   double-provider tests are deferred to D-014. OK?
10. **D-002's `embedding-refresh` stub gets its body replaced**
    in this directive — same function id, same triggers, new body.
    The deferred-d009 rows will be re-processed on the next cron
    sweep. OK?
11. **PII boundary review:** the Lead Enrichment Agent's prompt
    receives the lead's name (`label`) and source. Phone/email
    deliberately NOT included. Documented in baseline 115. OK?
12. **Baseline 115 ratification path:** same as baseline 110 + 112
    — via the hook-disable runbook (Option 1) at end of Group D,
    logged in `.claude/hooks/log/overrides.log`. OK?
