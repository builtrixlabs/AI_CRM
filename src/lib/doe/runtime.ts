import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ACTION_HANDLERS } from "./actions";
import { evaluateCondition } from "./conditions";
import type {
  DirectiveRow,
  DispatchResult,
  Outcome,
  Trigger,
  TriggerKind,
} from "./types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const TIER_RANK = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 } as const;

const RATE_LIMIT_PER_24H = 100;

export type DispatchDeps = {
  client?: SupabaseClient;
  /** Inject for tests. Defaults to `Date.now()`. */
  now?: () => number;
};

/**
 * Load every directive that matches `(trigger_kind, organization_id)`.
 * Platform-default rows have `organization_id IS NULL`; per-org rows
 * shadow the platform default for the same `code`.
 */
export async function loadActiveDirectives(
  trigger_kind: TriggerKind,
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<DirectiveRow[]> {
  const { data, error } = await client
    .from("directives")
    .select(
      "id, organization_id, code, display_name, trigger_kind, trigger_config, action_kind, action_config, tier, enabled"
    )
    .eq("trigger_kind", trigger_kind)
    .eq("enabled", true)
    .is("deleted_at", null);

  if (error || !data) return [];

  const rows = data as DirectiveRow[];
  // Org-specific shadows platform-default for the same `code`.
  const byCode = new Map<string, DirectiveRow>();
  for (const r of rows) {
    if (r.organization_id != null && r.organization_id !== organization_id) continue;
    const existing = byCode.get(r.code);
    if (!existing) {
      byCode.set(r.code, r);
      continue;
    }
    // Prefer org-specific over platform-default.
    if (existing.organization_id == null && r.organization_id != null) {
      byCode.set(r.code, r);
    }
  }
  return Array.from(byCode.values());
}

async function isIdempotent(
  client: SupabaseClient,
  directive_id: string,
  subject_node_id: string | null,
  trigger_id: string
): Promise<boolean> {
  let query = client
    .from("directive_invocations")
    .select("id")
    .eq("directive_id", directive_id)
    .eq("trigger_id", trigger_id)
    .eq("outcome", "dispatched");
  query =
    subject_node_id == null
      ? query.is("subject_node_id", null)
      : query.eq("subject_node_id", subject_node_id);
  const { data, error } = await query.limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

async function isRateLimited(
  client: SupabaseClient,
  directive_id: string,
  organization_id: string,
  now_ms: number
): Promise<boolean> {
  const cutoff = new Date(now_ms - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await client
    .from("directive_invocations")
    .select("id", { count: "exact", head: true })
    .eq("directive_id", directive_id)
    .eq("organization_id", organization_id)
    .eq("outcome", "dispatched")
    .gte("ts", cutoff);
  if (error) return false;
  return (count ?? 0) >= RATE_LIMIT_PER_24H;
}

async function recordInvocation(
  client: SupabaseClient,
  args: {
    directive_id: string;
    organization_id: string;
    workspace_id: string | null;
    subject_node_id: string | null;
    trigger_id: string;
    outcome: Outcome;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await client.from("directive_invocations").insert({
    directive_id: args.directive_id,
    organization_id: args.organization_id,
    workspace_id: args.workspace_id,
    subject_node_id: args.subject_node_id,
    trigger_id: args.trigger_id,
    outcome: args.outcome,
    details: args.details ?? null,
  });
  if (error) {
    console.warn("[doe] directive_invocations insert failed", error.message);
  }
}

/**
 * Core: run every directive matching `trigger.kind`. Returns one
 * DispatchResult per directive considered (firing or skipped).
 */
export async function dispatchDirective(
  trigger: Trigger,
  deps: DispatchDeps = {}
): Promise<DispatchResult[]> {
  const client = deps.client ?? getSupabaseAdmin();
  const now_ms = deps.now ? deps.now() : Date.now();

  const directives = await loadActiveDirectives(
    trigger.kind,
    trigger.organization_id,
    client
  );
  const results: DispatchResult[] = [];

  for (const directive of directives) {
    if (!directive.enabled) {
      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "skipped_disabled",
      });
      results.push({ directive_id: directive.id, code: directive.code, outcome: "skipped_disabled" });
      continue;
    }

    // T3 / T4 require approval; runtime stamps pending and stops.
    if (TIER_RANK[directive.tier] >= TIER_RANK.T3) {
      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "pending_approval",
        details: { tier: directive.tier },
      });
      results.push({
        directive_id: directive.id,
        code: directive.code,
        outcome: "pending_approval",
      });
      continue;
    }

    const cond = evaluateCondition(directive, trigger);
    if (!cond.ok) {
      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "skipped_condition",
        details: { reason: cond.reason },
      });
      results.push({
        directive_id: directive.id,
        code: directive.code,
        outcome: "skipped_condition",
        details: { reason: cond.reason },
      });
      continue;
    }

    if (
      await isIdempotent(
        client,
        directive.id,
        trigger.subject_node_id,
        trigger.trigger_id
      )
    ) {
      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "skipped_idempotent",
      });
      results.push({ directive_id: directive.id, code: directive.code, outcome: "skipped_idempotent" });
      continue;
    }

    if (await isRateLimited(client, directive.id, trigger.organization_id, now_ms)) {
      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "rate_limited",
      });
      results.push({ directive_id: directive.id, code: directive.code, outcome: "rate_limited" });
      continue;
    }

    const handler = ACTION_HANDLERS[directive.action_kind];
    if (!handler) {
      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "error",
        details: { reason: `unknown action_kind ${directive.action_kind}` },
      });
      results.push({
        directive_id: directive.id,
        code: directive.code,
        outcome: "error",
      });
      continue;
    }

    try {
      const action_result = await handler(directive, trigger, client);

      // Audit row.
      await client.from("audit_log").insert({
        actor_id: SYSTEM_UUID,
        actor_type: "system",
        actor_role: "doe_runtime",
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        table_name: "directives",
        record_id: directive.id,
        action: "directive_fired",
        agent_tier: directive.tier,
        compiled_artifact: {
          directive_id: directive.id,
          code: directive.code,
          trigger: {
            kind: trigger.kind,
            trigger_id: trigger.trigger_id,
            subject_node_id: trigger.subject_node_id,
          },
          action: {
            kind: directive.action_kind,
            result: action_result,
          },
        },
      });

      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "dispatched",
        details: action_result,
      });
      results.push({
        directive_id: directive.id,
        code: directive.code,
        outcome: "dispatched",
        details: action_result,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await recordInvocation(client, {
        directive_id: directive.id,
        organization_id: trigger.organization_id,
        workspace_id: trigger.workspace_id,
        subject_node_id: trigger.subject_node_id,
        trigger_id: trigger.trigger_id,
        outcome: "error",
        details: { reason },
      });
      results.push({
        directive_id: directive.id,
        code: directive.code,
        outcome: "error",
        details: { reason },
      });
    }
  }

  return results;
}
