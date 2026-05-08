import type { AgentTier } from "@/lib/ai/types";

export type AgentSpec = {
  /** Stable agent_type slug. Matches `agent_service_accounts.agent_type`. */
  type: string;
  display_name: string;
  max_tier: AgentTier;
  prompt_version: string;
};

export const AGENTS = [
  {
    type: "lead_enrichment",
    display_name: "Lead Enrichment Agent",
    max_tier: "T1",
    prompt_version: "v1",
  },
] as const satisfies readonly AgentSpec[];

export type AgentType = (typeof AGENTS)[number]["type"];

export function findAgent(type: string): AgentSpec | undefined {
  return AGENTS.find((a) => a.type === type);
}

const AGENT_TIER_RANK: Record<AgentTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
};

/** True iff `attempted` is at or below the agent's max ceiling. */
export function withinCeiling(
  attempted: AgentTier,
  max: AgentTier,
): boolean {
  return AGENT_TIER_RANK[attempted] <= AGENT_TIER_RANK[max];
}
