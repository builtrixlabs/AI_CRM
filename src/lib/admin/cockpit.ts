import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOnboardingState } from "./onboarding";
import type { CockpitData } from "./types";

/**
 * Read-side fetcher for the /admin cockpit. Uses the service-role admin
 * client (RLS would let an org_admin SELECT subscriptions / profiles for
 * their own org; we use service-role to keep the surface uniform with
 * future cross-table aggregations like leads_30d).
 *
 * Caller MUST have already gated on `requirePermission(user, 'organizations:view')`
 * AND verified `org_id === user.org_id`.
 */
export async function getCockpitData(
  org_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<CockpitData> {
  const subQ = await client
    .from("subscriptions")
    .select("plan_tier, status")
    .eq("organization_id", org_id)
    .is("deleted_at", null)
    .maybeSingle();

  const usersQ = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org_id)
    .is("deleted_at", null);

  const wsQ = await client
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org_id)
    .is("deleted_at", null);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const leadsQ = await client
    .from("nodes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .gte("created_at", thirtyDaysAgo);

  const ticketsQ = await client
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org_id)
    .eq("status", "open")
    .is("deleted_at", null);

  const onboarding = await getOnboardingState(org_id, client);

  return {
    subscription: subQ.data ?? null,
    usage: {
      active_users: usersQ.count ?? 0,
      workspaces: wsQ.count ?? 0,
      leads_30d: leadsQ.count ?? 0,
    },
    open_tickets: ticketsQ.count ?? 0,
    onboarding: {
      completed: onboarding.completed,
      current_step: onboarding.current_step,
    },
  };
}
