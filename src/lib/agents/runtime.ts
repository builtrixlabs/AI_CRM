import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as gateway from "@/lib/ai/gateway";
import {
  TierCeilingExceededError,
  type AgentInvocation,
  type AgentResult,
} from "./types";
import { withinCeiling } from "./registry";
import type { AgentTier } from "@/lib/ai/types";

export type AgentDeps = {
  /** Override gateway for tests. */
  gateway?: typeof gateway;
  /** Override supabase client for tests. */
  client?: SupabaseClient;
};

export type AgentHandler = (
  inv: AgentInvocation,
  deps: AgentDeps,
) => Promise<AgentResult>;

const HANDLERS: Map<string, AgentHandler> = new Map();

/** Register a handler keyed by `${agent_type}:${action}`. */
export function registerAgentHandler(
  agent_type: string,
  action: string,
  handler: AgentHandler,
): void {
  HANDLERS.set(`${agent_type}:${action}`, handler);
}

export function getAgentHandler(
  agent_type: string,
  action: string,
): AgentHandler | undefined {
  return HANDLERS.get(`${agent_type}:${action}`);
}

type AgentRow = {
  id: string;
  agent_type: string;
  display_name: string;
  max_tier: AgentTier;
  prompt_version: string;
};

/**
 * Load the registered service-account row, enforce tier ceiling, then
 * dispatch to the handler keyed by `agent_type:action`. Returns
 * AgentResult; throws TierCeilingExceededError on ceiling breach.
 */
export async function runAgent(
  inv: AgentInvocation,
  deps: AgentDeps = {},
): Promise<AgentResult> {
  const client = deps.client ?? getSupabaseAdmin();

  const { data: row, error } = await client
    .from("agent_service_accounts")
    .select("id, agent_type, display_name, max_tier, prompt_version")
    .eq("id", inv.agent_id)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      error: "unknown",
      message: `agent lookup failed: ${error.message}`,
    };
  }
  const agent = (row as AgentRow | null) ?? null;
  if (!agent) {
    return {
      ok: false,
      error: "validation",
      message: `agent ${inv.agent_id} not registered`,
    };
  }

  if (!withinCeiling(inv.attempted_tier, agent.max_tier)) {
    throw new TierCeilingExceededError(
      inv.agent_id,
      inv.attempted_tier,
      agent.max_tier,
    );
  }

  const handler = getAgentHandler(agent.agent_type, inv.action);
  if (!handler) {
    return {
      ok: false,
      error: "validation",
      message: `no handler registered for ${agent.agent_type}:${inv.action}`,
    };
  }

  try {
    return await handler(inv, { ...deps, client });
  } catch (err) {
    if (err instanceof TierCeilingExceededError) throw err;
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
