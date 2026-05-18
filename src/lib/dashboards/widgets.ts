import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { LEAD_STATES } from "@/lib/leads/types";
import type { WidgetType } from "./types";

/**
 * D-021 — server-side widget data fetchers. Each returns a small
 * structured payload the matching Server Component renders.
 *
 * All filter by caller's organization_id; service-role + caller_org_id
 * pattern.
 */

export type LeadCountByStateData = Array<{
  state: string;
  count: number;
}>;

export async function fetchLeadCountByState(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<LeadCountByStateData> {
  const counts = new Map<string, number>();
  for (const s of LEAD_STATES) counts.set(s, 0);

  const { data, error } = await client
    .from("nodes")
    .select("state")
    .eq("organization_id", organization_id)
    .eq("node_type", "lead")
    .is("deleted_at", null);
  if (error || !data) return [];
  for (const row of data as Array<{ state: string }>) {
    if (counts.has(row.state)) {
      counts.set(row.state, (counts.get(row.state) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([state, count]) => ({ state, count }));
}

export type DirectiveFires24hData = {
  total: number;
  dispatched: number;
  rate_limited: number;
  pending_approval: number;
  errored: number;
};

export async function fetchDirectiveFires24h(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<DirectiveFires24hData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("directive_invocations")
    .select("outcome")
    .eq("organization_id", organization_id)
    .gte("ts", since);
  const out: DirectiveFires24hData = {
    total: 0,
    dispatched: 0,
    rate_limited: 0,
    pending_approval: 0,
    errored: 0,
  };
  if (error || !data) return out;
  for (const r of data as Array<{ outcome: string }>) {
    out.total += 1;
    if (r.outcome === "dispatched") out.dispatched += 1;
    else if (r.outcome === "rate_limited") out.rate_limited += 1;
    else if (r.outcome === "pending_approval") out.pending_approval += 1;
    else if (r.outcome === "error") out.errored += 1;
  }
  return out;
}

export type ActiveUsersCountData = { count: number };

export async function fetchActiveUsersCount(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ActiveUsersCountData> {
  const { count, error } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization_id)
    .is("deleted_at", null);
  if (error) return { count: 0 };
  return { count: count ?? 0 };
}

export type RecentLeadsData = Array<{
  id: string;
  label: string;
  state: string;
  created_at: string;
}>;

export async function fetchRecentLeads(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<RecentLeadsData> {
  const { data, error } = await client
    .from("nodes")
    .select("id, label, state, created_at")
    .eq("organization_id", organization_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return data as RecentLeadsData;
}

export type AgentStatusData = {
  total_registered: number;
  provisioned: number;
  suspended: number;
};

export async function fetchAgentStatus(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AgentStatusData> {
  const [registryResult, configsResult] = await Promise.all([
    client
      .from("agent_service_accounts")
      .select("id", { count: "exact", head: true }),
    client
      .from("agent_org_configs")
      .select("enabled")
      .eq("organization_id", organization_id)
      .is("deleted_at", null),
  ]);
  const total_registered = registryResult.count ?? 0;
  let provisioned = 0;
  let suspended = 0;
  if (!configsResult.error && configsResult.data) {
    for (const c of configsResult.data as Array<{ enabled: boolean }>) {
      provisioned += 1;
      if (!c.enabled) suspended += 1;
    }
  }
  return { total_registered, provisioned, suspended };
}

export type WidgetData = {
  lead_count_by_state: LeadCountByStateData;
  directive_fires_24h: DirectiveFires24hData;
  active_users_count: ActiveUsersCountData;
  recent_leads: RecentLeadsData;
  agent_status: AgentStatusData;
};

export async function fetchWidgetData<T extends WidgetType>(
  type: T,
  organization_id: string,
  client?: SupabaseClient,
): Promise<WidgetData[T]> {
  const c = client ?? getSupabaseAdmin();
  switch (type) {
    case "lead_count_by_state":
      return (await fetchLeadCountByState(organization_id, c)) as WidgetData[T];
    case "directive_fires_24h":
      return (await fetchDirectiveFires24h(organization_id, c)) as WidgetData[T];
    case "active_users_count":
      return (await fetchActiveUsersCount(organization_id, c)) as WidgetData[T];
    case "recent_leads":
      return (await fetchRecentLeads(organization_id, c)) as WidgetData[T];
    case "agent_status":
      return (await fetchAgentStatus(organization_id, c)) as WidgetData[T];
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown widget type: ${String(_exhaustive)}`);
    }
  }
}
