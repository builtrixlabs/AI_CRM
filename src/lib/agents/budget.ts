/**
 * V3.x — per-org token-budget cap on agent runs.
 *
 * Backlog item 38 (H). Agents read agent_org_configs.monthly_token_budget;
 * if set and current month's token usage already meets/exceeds the budget,
 * the agent dispatch returns `over_budget` without calling the LLM.
 *
 * Plan-tier defaults (item 56 / D-124) are read here so a tier change takes
 * effect on the next agent run without per-org config edits.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BudgetCheck =
  | { ok: true; remaining: number; cap: number; usage: number }
  | { ok: false; error: "over_budget" | "lookup_failed"; usage?: number; cap?: number };

/**
 * Plan-tier defaults for agent monthly token budget. Tunable via the
 * platform_flags table at run time (key: agent_token_budget_<tier>).
 * V3.x part 2 (D-124) wires these as the default when monthly_token_budget
 * is NULL on agent_org_configs.
 */
export const TIER_DEFAULT_BUDGET: Record<string, number> = {
  starter: 100_000,
  professional: 1_000_000,
  enterprise: 10_000_000,
  custom: 0, // signals "no default — must be set on agent_org_configs"
};

export async function checkAgentBudget(
  organization_id: string,
  agent_type: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<BudgetCheck> {
  // 1. Resolve cap: agent_org_configs.monthly_token_budget OR plan-tier default.
  const { data: cfgRow, error: cfgErr } = await client
    .from("agent_org_configs")
    .select("monthly_token_budget")
    .eq("organization_id", organization_id)
    .eq("agent_type", agent_type)
    .maybeSingle();
  if (cfgErr) return { ok: false, error: "lookup_failed" };

  let cap = (cfgRow as { monthly_token_budget: number | null } | null)?.monthly_token_budget ?? null;
  if (cap === null) {
    const { data: subRow } = await client
      .from("subscriptions")
      .select("plan_tier")
      .eq("organization_id", organization_id)
      .maybeSingle();
    const tier = (subRow as { plan_tier: string } | null)?.plan_tier ?? "starter";
    cap = TIER_DEFAULT_BUDGET[tier] ?? TIER_DEFAULT_BUDGET.starter;
  }

  // 2. Look up this month's usage via SECURITY DEFINER RPC.
  const { data: usageRaw, error: usageErr } = await client.rpc(
    "get_agent_token_usage_this_month",
    { p_org_id: organization_id, p_agent_type: agent_type },
  );
  if (usageErr) return { ok: false, error: "lookup_failed" };
  const usage = typeof usageRaw === "number" ? usageRaw : Number(usageRaw ?? 0);

  if (cap === 0 || usage >= cap) {
    return { ok: false, error: "over_budget", usage, cap };
  }
  return { ok: true, remaining: cap - usage, cap, usage };
}
