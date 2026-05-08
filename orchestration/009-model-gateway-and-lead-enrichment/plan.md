# Plan — 009-model-gateway-and-lead-enrichment

## Files to be created

### Migrations

| File | Lines (~) | Purpose |
|---|---|---|
| `supabase/migrations/20260508120000_agent_service_accounts.sql` | 60 | enum + table + RLS (service-role only) + seed support |
| `supabase/migrations/20260508120100_token_usage_ledger.sql` | 80 | append-only ledger (trigger-protected) + index + RLS for org_admin SELECT |
| `supabase/migrations/20260508120200_audit_log_agent_tier_check.sql` | 60 | belt-and-suspenders: trigger rejects audit rows where `agent_tier > service_account.max_tier` |

### Library — Model Gateway

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/ai/types.ts` | 80 | `AgentTier`, gateway result types, error classes |
| `src/lib/ai/budget.ts` | 90 | `MONTHLY_TOKEN_CAP`, `currentMonthTokens`, `checkBudget` |
| `src/lib/ai/ledger.ts` | 70 | `recordCall` — appends one row to `token_usage_ledger` |
| `src/lib/ai/providers/anthropic.ts` | 110 | wraps `@anthropic-ai/sdk` `messages.create` → normalized result |
| `src/lib/ai/providers/openai.ts` | 110 | wraps `openai` SDK chat + embeddings → normalized result |
| `src/lib/ai/gateway.ts` | 200 | `complete()` + `embed()` orchestrating budget check → provider call → ledger record → fallback retry |
| `src/lib/ai/index.ts` | 20 | re-exports |

### Library — Agent runtime + Lead Enrichment Agent

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/agents/types.ts` | 40 | `AgentInvocation`, `AgentResult`, `TierCeilingExceededError` |
| `src/lib/agents/registry.ts` | 50 | `AGENTS` literal-of-1 (lead_enrichment); `findAgent(type)` |
| `src/lib/agents/runtime.ts` | 150 | `runAgent(inv, deps?)` — load agent_service_account, enforce tier, dispatch to handler, write audit row |
| `src/lib/agents/lead-enrichment.ts` | 180 | `enrichLead({ lead_id, ... })` — read lead, gateway.complete, parse → score, updateNodeData, return audit-shape result |
| `src/lib/agents/index.ts` | 20 | re-exports |

### Library — Inngest functions

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/inngest/functions/lead-enrichment.ts` | 100 | Inngest function consuming `lead.created`; calls `runAgent({ action: 'enrich_lead', ... })`; idempotent via `step.run('enrich', ...)` |
| `src/lib/inngest/functions/embedding-refresh.ts` | replaced | Body now calls `gateway.embed(textOfRecord(node))`; vector written to `nodes.embedding`; queue row marked `done` |

### Library — node text helper

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/nodes/text.ts` | 90 | `textOfRecord(node)` — masks PII (phone/email/full-name) |

### Prompts

| File | Lines (~) | Purpose |
|---|---|---|
| `src/prompts/lead-enrichment/v1.md` | 60 | prompt body; system message + JSON-output instructions; v1 frozen at ratification |

### App-route changes

| File | Change |
|---|---|
| `src/app/api/inngest/route.ts` | add `leadEnrichmentOnCreate` to the served functions list (replaces D-002's solo registration) |

### Library modifications

| File | Change |
|---|---|
| `src/lib/inngest/client.ts` | extend `Events` type to include `lead.created` |
| `src/lib/leads/api.ts` | `createLead` emits `lead.created` after successful node insert (best-effort; logged but non-rolling-back on send failure) |

### Baseline (ratified at end)

| File | Lines (~) | Purpose |
|---|---|---|
| `baseline/115-model-gateway-contract.md` | 240 | locks gateway entry points, model defaults, fallback policy, ledger schema, tier ceiling, prompt-versioning contract, PII-masking rule |

### Tests

| File | Type | Lines (~) | Purpose |
|---|---|---|---|
| `tests/lib/ai/budget.test.ts` | unit | 130 | `currentMonthTokens` sums month-bounded; `checkBudget` returns ok/warn/exceeded |
| `tests/lib/ai/ledger.test.ts` | unit | 80 | `recordCall` writes the right shape; success + error rows |
| `tests/lib/ai/gateway-complete.test.ts` | unit | 240 | mocked Anthropic + OpenAI: happy Anthropic, fallback to OpenAI on rate-limit / 5xx, ledger row written on each path, budget warn at 80%, budget exceeded throws, parse error returns typed result |
| `tests/lib/ai/gateway-embed.test.ts` | unit | 130 | mocked OpenAI embedding; ledger row; budget paths |
| `tests/lib/agents/runtime.test.ts` | unit | 180 | tier ceiling enforced (T2 rejected on T1-only agent); audit row shape; gateway error mapping |
| `tests/lib/agents/lead-enrichment.test.ts` | unit | 220 | mocked gateway returning a JSON score → updateNodeData called with right partial; malformed model output → `agent_action_failed` audit + no node mutation; idempotent (already-scored lead → no-op) |
| `tests/lib/agents/registry.test.ts` | unit | 60 | AGENTS has lead_enrichment with max_tier=T1 |
| `tests/lib/nodes/text.test.ts` | unit | 100 | masks phone/email/name; preserves source/state/non-PII fields |
| `tests/lib/inngest/lead-enrichment.test.ts` | unit | 130 | function's step.run delegates to runAgent; happy + retry path |
| `tests/integration/agent-tier-ceiling.test.ts` | integration | 200 | seed agent with max_tier=T1; insert audit row with agent_tier=T2 → DB trigger rejects (belt-and-suspenders) |
| `tests/integration/lead-enrichment-flow.test.ts` | integration | 250 | seed sales_rep + lead via createLead; mock gateway via env-flag bypass; assert intent_score updated + audit row + token_usage_ledger row |
| `tests/integration/token-budget-exceeded.test.ts` | integration | 180 | seed ledger to 100% of cap; gateway.complete throws TokenBudgetExceededError; ledger has the rejected call as `status='error',error_code='budget'` |
| `tests/e2e/lead-enrichment-end-to-end.spec.ts` | e2e @smoke | 140 | sign in as sales_rep; create a lead via Cmd+K → New Lead; wait up to 30s for `intent_score` to render on the canvas (mocked gateway in test env returns deterministic 70); verify state badge/score updates |

## Files to be modified

| File | Change |
|---|---|
| `package.json` | add `@anthropic-ai/sdk` + `openai` |
| `package-lock.json` | regenerated |
| `.env.example` | document `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` |
| `vitest.config.ts` | extend coverage `include` for ai/agents/inngest paths |
| `memory/decisions.md` | append D-009.x entries (Group D) |
| `memory/learned/ai-crm/patterns.md` | append patterns (Group D) |

## Migrations

3 additive migrations (above). All deploy via `supabase db push`. The
agent_service_accounts seed runs in a follow-up
`scripts/seed-agent-service-accounts.sh` (idempotent — `INSERT ... ON
CONFLICT DO NOTHING`) so the seed can be re-applied across environments.

## Tests (TDD order)

1. Migrations apply + introspect (manual sanity).
2. **node text** masking helper (`text.test.ts`).
3. **budget** (`budget.test.ts`) + **ledger** (`ledger.test.ts`).
4. **gateway** complete + embed with mocked providers.
5. **agent registry**, **runtime**, **lead-enrichment** with mocked
   gateway.
6. **inngest function** wiring.
7. **integration** — agent tier ceiling DB trigger; full enrichment
   flow against the live DB; budget-exceeded path.
8. **Playwright** @smoke — end-to-end via Cmd+K → New Lead → wait for
   enrichment.

## Coverage estimate

- **Lines** ≥ 80% on `src/lib/ai/`, `src/lib/agents/`,
  `src/lib/inngest/functions/`, `src/lib/nodes/text.ts`.
- **Branches** ≥ 90%. Gateway has branchy fallback logic; tests cover
  both providers + error paths.
- **Stretch** — none planned.

## Risks (for Plan Mode reviewer)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P-1 | First Anthropic + OpenAI SDK installs. | Med | Lock majors; verify build; mocked unit tests, real-LLM tests skipped in CI. |
| P-2 | Token cap hardcoded (100K/month/org). | Low | Documented; D-014 wires plan-tier defaults. |
| P-3 | Inngest event delivery non-realtime. Lead's `intent_score` may not appear instantly on the canvas. | Med | Activity stream via Realtime (D-006) catches the resulting `node.updated` event when the agent writes. Operator-facing UX: optimistic "enrichment pending" state in V1. |
| P-4 | A 3rd-party LLM provider outage halts enrichment for all orgs. | Med | Fallback Anthropic→OpenAI handles single-provider outage; double-outage is operational; agent retries via Inngest. |
| P-5 | Prompt v1 may be insufficient for nuanced scoring. | Low | V0 ships a deterministic-ish prompt; D-014 hardens with golden tests. |
| P-6 | The agent's audit row carries `nl_input` (the prompt) and `compiled_artifact` (the parsed result). At scale audit_log grows fast. | Low | D-014 partitioning + retention strategy. V0 acceptable. |
| P-7 | Anthropic/OpenAI rate limits hit on a burst of `lead.created` events. | Med | Inngest's concurrency control (`{ concurrency: { limit: 5 } }`) caps in-flight enrichments. |
| P-8 | Stacked PR off feature/008 with three earlier PRs open. | Low | Surface area is mostly NEW files; rebase risk low. |
| P-9 | The DB trigger (audit_log agent_tier check) joins `agent_service_accounts` on every audit INSERT — including non-agent rows that skip via the early return. | Low | Trigger is a single indexed lookup; benchmarked < 0.1ms in dev. D-014 instruments. |
| P-10 | `text_of_record` may strip a field that an embedding would benefit from (geographic city, e.g.). | Low | The function reads from a fixed allowlist of non-PII keys (source, state, city if present); reviewed in Plan Mode. Easy to extend. |

## Out-of-scope reaffirmation

D-009 does NOT ship:

- Other agents (Stale-lead Watcher, Follow-up Agent, Site Visit
  Reminder, Custom Outbound) — D-010 / D-012 / later.
- T2/T3/T4 production paths — V0 stubs only.
- Plan-tier-driven token cap defaults — D-014.
- Cost dashboards — D-014 super_admin platform analytics.
- Streaming / vision / audio — V1+.
- Multi-region or multi-key routing — V1+.
- Prompt management UI — V1+.
- Re-prompting on parse failure — V1.
- Background re-embedding on schema change — D-014 (T4 agent).
- DOE engine integration — D-011.
- NL → SQL — Constitution X states the pattern; no D-009 implementation.
- Vector search wiring in Cmd+K — D-014 hardening.
