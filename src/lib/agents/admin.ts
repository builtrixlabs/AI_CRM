import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AgentTier } from "@/lib/ai/types";

/**
 * D-019 — Per-org agent provisioning helpers.
 *
 * Sits above D-009's global `agent_service_accounts`. Each org gets at
 * most one config row per agent_type (enabled flag + optional max_tier
 * override). The runtime consults these.
 */

const SYSTEM_VIA = "manual" as const;
const TIER_VALUES = ["T0", "T1", "T2", "T3", "T4"] as const;

export const provisionInputSchema = z
  .object({
    agent_type: z.string().min(1).max(64),
  })
  .strict();
export type ProvisionInput = z.infer<typeof provisionInputSchema>;

export const toggleInputSchema = z
  .object({
    agent_type: z.string().min(1).max(64),
    enabled: z.boolean(),
    suspended_reason: z.string().max(500).optional(),
  })
  .strict();
export type ToggleInput = z.infer<typeof toggleInputSchema>;

export const setTierInputSchema = z
  .object({
    agent_type: z.string().min(1).max(64),
    max_tier_override: z.enum(TIER_VALUES).nullable(),
  })
  .strict();
export type SetTierInput = z.infer<typeof setTierInputSchema>;

export class AgentAdminError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_found" | "invalid",
  ) {
    super(message);
    this.name = "AgentAdminError";
  }
}

export type AgentRegistryRow = {
  id: string;
  agent_type: string;
  display_name: string;
  max_tier: AgentTier;
  prompt_version: string;
};

export type AgentOrgConfigRow = {
  id: string;
  organization_id: string;
  agent_type: string;
  enabled: boolean;
  max_tier_override: AgentTier | null;
  suspended_at: string | null;
  suspended_reason: string | null;
};

export type AgentSurfaceRow = AgentRegistryRow & {
  config: AgentOrgConfigRow | null;
  effective_max_tier: AgentTier;
  status: "not_provisioned" | "active" | "suspended";
};

const TIER_RANK: Record<AgentTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
};

export function effectiveMaxTier(
  global: AgentTier,
  override: AgentTier | null,
): AgentTier {
  if (!override) return global;
  return TIER_RANK[override] < TIER_RANK[global] ? override : global;
}

export async function listAgentSurface(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AgentSurfaceRow[]> {
  const [registryResult, configsResult] = await Promise.all([
    client
      .from("agent_service_accounts")
      .select("id, agent_type, display_name, max_tier, prompt_version")
      .order("agent_type", { ascending: true }),
    client
      .from("agent_org_configs")
      .select(
        "id, organization_id, agent_type, enabled, max_tier_override, suspended_at, suspended_reason",
      )
      .eq("organization_id", organization_id)
      .is("deleted_at", null),
  ]);

  if (registryResult.error || !registryResult.data) return [];
  const registry = registryResult.data as AgentRegistryRow[];

  const configsByType = new Map<string, AgentOrgConfigRow>();
  if (!configsResult.error && configsResult.data) {
    for (const r of configsResult.data as AgentOrgConfigRow[]) {
      configsByType.set(r.agent_type, r);
    }
  }

  return registry.map((reg) => {
    const config = configsByType.get(reg.agent_type) ?? null;
    let status: "not_provisioned" | "active" | "suspended";
    if (!config) status = "not_provisioned";
    else if (!config.enabled) status = "suspended";
    else status = "active";
    return {
      ...reg,
      config,
      effective_max_tier: effectiveMaxTier(
        reg.max_tier,
        config?.max_tier_override ?? null,
      ),
      status,
    };
  });
}

async function findRegistry(
  agent_type: string,
  client: SupabaseClient,
): Promise<AgentRegistryRow | null> {
  const { data, error } = await client
    .from("agent_service_accounts")
    .select("id, agent_type, display_name, max_tier, prompt_version")
    .eq("agent_type", agent_type)
    .maybeSingle();
  if (error) return null;
  return (data as AgentRegistryRow | null) ?? null;
}

async function findConfig(
  organization_id: string,
  agent_type: string,
  client: SupabaseClient,
): Promise<AgentOrgConfigRow | null> {
  const { data, error } = await client
    .from("agent_org_configs")
    .select(
      "id, organization_id, agent_type, enabled, max_tier_override, suspended_at, suspended_reason",
    )
    .eq("organization_id", organization_id)
    .eq("agent_type", agent_type)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as AgentOrgConfigRow | null) ?? null;
}

export async function provisionAgent(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: ProvisionInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string; agent_type: string }> {
  const reg = await findRegistry(args.input.agent_type, client);
  if (!reg) {
    throw new AgentAdminError(
      `Unknown agent: ${args.input.agent_type}`,
      "not_found",
    );
  }
  const existing = await findConfig(
    args.caller_org_id,
    args.input.agent_type,
    client,
  );
  if (existing) {
    return { id: existing.id, agent_type: existing.agent_type };
  }

  const insertResult = await client
    .from("agent_org_configs")
    .insert({
      organization_id: args.caller_org_id,
      agent_type: args.input.agent_type,
      enabled: true,
      created_by: args.actor_id,
      created_via: SYSTEM_VIA,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .select("id")
    .single();
  const insErr = (insertResult as { error: { message: string } | null }).error;
  if (insErr) throw new AgentAdminError(insErr.message, "invalid");
  const inserted = (insertResult as { data: { id: string } }).data;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "agent_org_configs",
    record_id: inserted.id,
    action: "agent_provisioned",
    diff: { agent_type: args.input.agent_type, max_tier: reg.max_tier },
  });

  return { id: inserted.id, agent_type: args.input.agent_type };
}

export async function toggleAgent(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: ToggleInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string; enabled: boolean }> {
  const config = await findConfig(
    args.caller_org_id,
    args.input.agent_type,
    client,
  );
  if (!config) {
    throw new AgentAdminError(
      `Agent not provisioned: ${args.input.agent_type}`,
      "not_found",
    );
  }
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    enabled: args.input.enabled,
    updated_at: now,
    updated_by: args.actor_id,
    updated_via: SYSTEM_VIA,
  };
  if (!args.input.enabled) {
    update.suspended_at = now;
    update.suspended_reason = args.input.suspended_reason ?? null;
  } else {
    update.suspended_at = null;
    update.suspended_reason = null;
  }

  const upd = await client
    .from("agent_org_configs")
    .update(update)
    .eq("id", config.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new AgentAdminError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "agent_org_configs",
    record_id: config.id,
    action: args.input.enabled ? "agent_resumed" : "agent_suspended",
    diff: {
      agent_type: args.input.agent_type,
      from: config.enabled,
      to: args.input.enabled,
      reason: args.input.suspended_reason ?? null,
    },
  });

  return { id: config.id, enabled: args.input.enabled };
}

export async function setMaxTierOverride(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: SetTierInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string; max_tier_override: AgentTier | null }> {
  const reg = await findRegistry(args.input.agent_type, client);
  if (!reg) {
    throw new AgentAdminError(
      `Unknown agent: ${args.input.agent_type}`,
      "not_found",
    );
  }
  const config = await findConfig(
    args.caller_org_id,
    args.input.agent_type,
    client,
  );
  if (!config) {
    throw new AgentAdminError(
      `Agent not provisioned: ${args.input.agent_type}`,
      "not_found",
    );
  }
  if (
    args.input.max_tier_override &&
    TIER_RANK[args.input.max_tier_override] > TIER_RANK[reg.max_tier]
  ) {
    throw new AgentAdminError(
      `max_tier_override (${args.input.max_tier_override}) cannot exceed global max (${reg.max_tier})`,
      "invalid",
    );
  }

  const now = new Date().toISOString();
  const upd = await client
    .from("agent_org_configs")
    .update({
      max_tier_override: args.input.max_tier_override,
      updated_at: now,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("id", config.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new AgentAdminError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "agent_org_configs",
    record_id: config.id,
    action: "agent_tier_set",
    diff: {
      agent_type: args.input.agent_type,
      from: config.max_tier_override,
      to: args.input.max_tier_override,
    },
  });

  return { id: config.id, max_tier_override: args.input.max_tier_override };
}

/**
 * Runtime helper: returns the per-org config for an agent_type.
 * The runtime calls this before every dispatch — if `config?.enabled === false`
 * the agent is suspended and the runtime should bail.
 */
export async function getOrgAgentConfig(
  organization_id: string,
  agent_type: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AgentOrgConfigRow | null> {
  return findConfig(organization_id, agent_type, client);
}

export const AGENT_TIER_OPTIONS = TIER_VALUES;
