# Spec — 009-model-gateway-and-lead-enrichment

(See [the directive](../../directives/009-model-gateway-and-lead-enrichment.md)
for prose; AC numbers below match.)

## Acceptance criteria

- [ ] **AC-1..AC-7** Model Gateway: `complete()` + `embed()` with
      Anthropic-default + OpenAI-fallback for completions; OpenAI
      `text-embedding-3-small` for embeddings. Token-ledger row per
      call. Pre-call cap check (warn 80%, hard-stop 100%). Server-only.
- [ ] **AC-8..AC-10** Agent runtime + tier ceiling enforced; one
      agent_service_account row seeded; every invocation writes ONE
      audit_log row with the Constitution IV agent fields.
- [ ] **AC-11..AC-14** Lead Enrichment Agent on the `lead.created`
      Inngest event; reads + scores + updates + audits. Failure path
      logs but doesn't mutate. Test mode bypasses real LLM.
- [ ] **AC-15..AC-17** Embedding refresh REPLACES D-002's
      deferred-d009 stub; calls `gateway.embed`; idempotent on
      re-process. `text_of_record(node)` masks PII.
- [ ] **AC-18..AC-21** Suite green; coverage ≥ 80/90 on D-009 paths;
      build ✓; baseline 115 ratified.

---

## Data model

### Migration `20260508120000_agent_service_accounts.sql`

```sql
CREATE TYPE agent_tier AS ENUM ('T0', 'T1', 'T2', 'T3', 'T4');

CREATE TABLE agent_service_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type      text NOT NULL UNIQUE,           -- 'lead_enrichment', ...
  display_name    text NOT NULL,
  max_tier        agent_tier NOT NULL,
  prompt_version  text NOT NULL,                  -- 'v1'
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- service-account profiles row (FK to profiles.id)
  profile_id      uuid NOT NULL REFERENCES profiles(id)
);

ALTER TABLE agent_service_accounts ENABLE ROW LEVEL SECURITY;
-- Service-role only; no authenticated policy (super_admin sees zero
-- rows; sales_rep sees zero rows).

NOTIFY pgrst, 'reload schema';

-- Seed: Lead Enrichment Agent. The matching profiles row is created
-- via `scripts/seed-agent-service-accounts.sh` (idempotent).
```

### Migration `20260508120100_token_usage_ledger.sql`

```sql
CREATE TABLE token_usage_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),       -- nullable for system-level calls (none yet)
  agent_id        uuid REFERENCES agent_service_accounts(id), -- nullable for non-agent calls
  request_id      text NOT NULL,                              -- gateway-generated correlation id
  model_used      text NOT NULL,                              -- 'claude-sonnet-4-6' | 'gpt-4-mini' | 'text-embedding-3-small'
  call_kind       text NOT NULL CHECK (call_kind IN ('complete', 'embed')),
  tokens_in       int NOT NULL DEFAULT 0,
  tokens_out      int NOT NULL DEFAULT 0,
  duration_ms     int,
  status          text NOT NULL CHECK (status IN ('ok', 'error')),
  error_code      text,
  ts              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX token_usage_ledger_org_ts_idx
  ON token_usage_ledger (organization_id, ts DESC);

-- Append-only via trigger (D-001.10 pattern)
CREATE OR REPLACE FUNCTION token_usage_ledger_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'token_usage_ledger is append-only';
END;
$$;

CREATE TRIGGER token_usage_ledger_no_update
  BEFORE UPDATE OR DELETE OR TRUNCATE ON token_usage_ledger
  FOR EACH ROW EXECUTE FUNCTION token_usage_ledger_append_only();

ALTER TABLE token_usage_ledger ENABLE ROW LEVEL SECURITY;
-- Authenticated: SELECT scoped by app_org_id() (org_admin sees own org)
CREATE POLICY token_usage_ledger_select_own_org
  ON token_usage_ledger FOR SELECT TO authenticated
  USING (organization_id = public.app_org_id());

NOTIFY pgrst, 'reload schema';
```

### Migration `20260508120200_audit_log_agent_tier_check.sql`

```sql
-- D-009 belt-and-suspenders: reject audit rows whose agent_tier
-- exceeds the service-account's max_tier (defense in depth on top of
-- the runtime check).
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_agent_tier_within_ceiling
  CHECK (
    actor_type <> 'agent'
    OR agent_tier IS NULL
    OR agent_tier IN ('T0','T1','T2','T3','T4')
  );

-- Stronger check via trigger that joins agent_service_accounts:
CREATE OR REPLACE FUNCTION audit_log_enforce_agent_ceiling()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  agent_max agent_tier;
BEGIN
  IF NEW.actor_type <> 'agent' OR NEW.agent_tier IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT max_tier INTO agent_max
    FROM agent_service_accounts WHERE id = NEW.actor_id;
  IF agent_max IS NULL THEN
    RAISE EXCEPTION 'audit_log: actor_id % is not a registered agent', NEW.actor_id;
  END IF;
  IF NEW.agent_tier::text > agent_max::text THEN
    RAISE EXCEPTION 'audit_log: agent_tier % exceeds service-account max_tier %',
      NEW.agent_tier, agent_max;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_agent_ceiling
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_enforce_agent_ceiling();
```

### Hardcoded V0 cap

`src/lib/ai/budget.ts`:
```ts
export const MONTHLY_TOKEN_CAP = 100_000;
export const SOFT_WARN_RATIO = 0.8;
```

---

## API contracts

### `src/lib/ai/gateway.ts`

```ts
export type GatewayCallContext = {
  organization_id: string | null;
  agent_id?: string;
  agent_tier?: AgentTier;
  request_id?: string;          // generated if absent
};

export type CompleteInput = GatewayCallContext & {
  prompt: string;
  system?: string;
  model_pref?: "anthropic" | "openai";
  max_tokens?: number;
};

export type CompleteOk = {
  ok: true;
  text: string;
  model_used: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  warnings?: ("budget-80")[];
};

export type GatewayErr = {
  ok: false;
  error: "budget" | "rate_limit" | "parse" | "network" | "unknown";
  message: string;
};

export type CompleteResult = CompleteOk | GatewayErr;

export async function complete(input: CompleteInput): Promise<CompleteResult>;

export type EmbedInput = GatewayCallContext & { text: string };
export type EmbedOk = {
  ok: true;
  vector: number[];          // length 1536 for text-embedding-3-small
  model_used: string;
  tokens_in: number;
  duration_ms: number;
  warnings?: ("budget-80")[];
};
export type EmbedResult = EmbedOk | GatewayErr;

export async function embed(input: EmbedInput): Promise<EmbedResult>;

export class TokenBudgetExceededError extends Error {
  constructor(public readonly organization_id: string, public readonly used: number, public readonly cap: number);
}
```

### `src/lib/ai/budget.ts`

```ts
export const MONTHLY_TOKEN_CAP: number;
export const SOFT_WARN_RATIO: number;

/** SUMs the ledger for current calendar month (UTC) for the org. */
export async function currentMonthTokens(
  organization_id: string,
  client?: SupabaseClient
): Promise<number>;

export type BudgetCheck =
  | { kind: "ok" }
  | { kind: "warn"; ratio: number }
  | { kind: "exceeded"; used: number; cap: number };

export async function checkBudget(
  organization_id: string,
  estimated_tokens: number,
  client?: SupabaseClient
): Promise<BudgetCheck>;
```

### `src/lib/ai/providers/`

- `anthropic.ts` — wraps `@anthropic-ai/sdk` `messages.create`. Returns
  the gateway's normalized shape.
- `openai.ts` — wraps `openai` SDK `chat.completions.create` and
  `embeddings.create`. Same normalized shape.

### `src/lib/agents/runtime.ts`

```ts
export type AgentInvocation = {
  agent_id: string;
  organization_id: string;
  workspace_id: string;
  action: string;             // 'enrich_lead' for D-009
  payload: unknown;
};

export type AgentResult =
  | { ok: true; tier: AgentTier; audit_log_id: string; output: unknown }
  | { ok: false; error: "ceiling" | "validation" | "gateway" | "unknown"; message?: string };

export async function runAgent(
  inv: AgentInvocation,
  deps?: { gateway?: typeof gateway; client?: SupabaseClient }
): Promise<AgentResult>;

export class TierCeilingExceededError extends Error {
  constructor(public readonly agent_id: string, public readonly attempted_tier: AgentTier, public readonly max_tier: AgentTier);
}
```

### `src/lib/agents/lead-enrichment.ts`

```ts
/**
 * V0 Lead Enrichment Agent. Triggered by Inngest on `lead.created`.
 * Reads the lead, calls gateway.complete with v1 prompt, parses to a
 * 0-100 intent_score, updates the node, writes one audit row.
 * Returns AgentResult.
 */
export async function enrichLead(args: {
  lead_id: string;
  organization_id: string;
  workspace_id: string;
}, deps?: { gateway?: typeof gateway; client?: SupabaseClient }): Promise<AgentResult>;
```

### `src/lib/inngest/client.ts` — extend Events

```ts
export type Events = {
  "node.embedding.refresh-requested": { ... };
  "lead.created": {
    data: { lead_id: string; organization_id: string; workspace_id: string };
  };
};
```

### `src/lib/leads/api.ts` — `createLead` emits the event

```ts
// After successful createNode:
await inngest.send({
  name: "lead.created",
  data: { lead_id: result.id, organization_id, workspace_id },
});
return result;
```

The event send is best-effort — a failure to enqueue is logged but
does NOT roll back the createLead. The lead is persistent; enrichment
is async + retry-able.

### `src/prompts/lead-enrichment/v1.md`

A small prompt that takes lead data (label, source, notes,
masked-or-unmasked phone) and emits a JSON `{ score, rationale }`.
Reviewed in Plan Mode.

### `src/lib/nodes/text.ts`

```ts
/**
 * Build embedding source text for a node. Masks PII per Constitution VII —
 * phone, email, full names dropped. Returns a stable string the embedding
 * model can score on category/state/source signals.
 */
export function textOfRecord(node: { node_type: string; label: string; data: Record<string, unknown>; state?: string | null }): string;
```

---

## UI surface

**None new.** D-009 is a backend directive. The Lead Enrichment Agent
writes `intent_score` to `nodes.data` which the existing Lead Canvas
(D-006) already renders via the `score` field renderer. Embedded
vectors land in `nodes.embedding` which D-008's `searchLeads`
ignores in V0 (D-014 hardening adds vector-search support).

---

## Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| RQ-1 | First Anthropic + OpenAI installs. Network latency in tests. | Unit tests inject mock `gateway`; integration tests mock at the SDK level. Real-LLM tests in a `@stretch` tag suite that's skipped in CI by default. |
| RQ-2 | OpenAI fallback exercised only on rare paths in production. | Unit tests force-fail the Anthropic mock to exercise fallback. |
| RQ-3 | Token cap hardcoded; enterprise org could exhaust V0 cap quickly. | Documented; D-014 wires plan-tier defaults. Operator can manually raise via a migration if the pilot needs it. |
| RQ-4 | The agent's prompt receives the lead's name (PII boundary). | Documented in baseline 115. Plan Mode review-of-record. Future agents that DON'T need PII (Stale-lead Watcher) MUST mask. |
| RQ-5 | Inngest event delivery is at-least-once; the agent must be idempotent. | The agent checks `intent_score` BEFORE running; if already set, it no-ops. Audit row also records `request_id` for dedup. |
| RQ-6 | LLM model output non-determinism — score may swing on re-run. | Acceptable for V0 (operator can re-trigger). The prompt asks for a stable scoring rubric. |
| RQ-7 | The tier-ceiling DB trigger fires on every audit insert; could be slow at scale. | Index lookup on `agent_service_accounts(id)` is O(1); negligible. |
| RQ-8 | Stacked PR off feature/008 while three earlier PRs (#6/#7/#8) are open. | Same precedent as D-007.8 / D-008.10. Surface area is mostly NEW files; rebase risk low. |
| RQ-9 | Prompt files in `src/prompts/` may be picked up by Next.js as a route group. | They're flat `.md` files outside `src/app/`; no route impact. Documented. |
| RQ-10 | A failed agent run leaves the lead with no `intent_score`. The Lead Canvas's Suggested-action slot (D-006 placeholder) won't surface enrichment errors. | Acceptable for V0. D-014 + D-011 (DOE) wire the Suggested-action slot to surface stale-enrichment leads. |
