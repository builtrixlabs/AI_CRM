import type { AgentTier } from "@/lib/ai/types";

export type AgentInvocation = {
  /** UUID of the agent_service_accounts row this run acts under. */
  agent_id: string;
  organization_id: string;
  workspace_id: string;
  /** Discriminator for the action being taken (e.g. 'enrich_lead'). */
  action: string;
  /** Tier the action requires (must be ≤ agent.max_tier). */
  attempted_tier: AgentTier;
  /** Action-specific payload. */
  payload: unknown;
};

export type AgentOk = {
  ok: true;
  tier: AgentTier;
  audit_log_id: string | null;
  output: unknown;
};

export type AgentErr = {
  ok: false;
  error: "ceiling" | "validation" | "gateway" | "unknown";
  message: string;
};

export type AgentResult = AgentOk | AgentErr;

export class TierCeilingExceededError extends Error {
  constructor(
    public readonly agent_id: string,
    public readonly attempted_tier: AgentTier,
    public readonly max_tier: AgentTier,
  ) {
    super(
      `TierCeilingExceededError: agent ${agent_id} attempted ${attempted_tier} (max ${max_tier})`,
    );
    this.name = "TierCeilingExceededError";
  }
}
