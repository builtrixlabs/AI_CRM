import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createNode } from "@/lib/nodes/api";
import { siteVisitSchema } from "@/lib/nodes/schemas/site_visit";
import {
  TERMINAL_STATES,
  assertTransitionAllowed,
  type SiteVisitState,
} from "./transitions";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type CreateSiteVisitArgs = {
  organization_id: string;
  workspace_id: string;
  created_by: string;
  lead_id: string;
  scheduled_at: string;
  deal_id?: string;
  property_id?: string;
  coordinator_id?: string;
  notes?: string;
};

/**
 * Insert a site_visit node `state='scheduled'` and an edge
 * `attended` from the visit → the lead. Validates against
 * `siteVisitSchema` first; throws on invalid input.
 */
export async function createSiteVisit(
  args: CreateSiteVisitArgs,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<{ id: string }> {
  const data = {
    lead_id: args.lead_id,
    scheduled_at: args.scheduled_at,
    deal_id: args.deal_id,
    property_id: args.property_id,
    coordinator_id: args.coordinator_id,
    notes: args.notes,
  };
  const parsed = siteVisitSchema.parse(data);

  const created = await createNode(
    {
      organization_id: args.organization_id,
      workspace_id: args.workspace_id,
      node_type: "site_visit",
      label: `Visit ${args.scheduled_at}`,
      data: parsed,
      state: "scheduled",
      created_by: args.created_by,
      created_via: "manual",
    },
    client
  );

  // Edge: site_visit --attended--> lead
  await client.from("edges").insert({
    organization_id: args.organization_id,
    workspace_id: args.workspace_id,
    from_node_id: created.id,
    to_node_id: args.lead_id,
    edge_type: "attended",
    created_by: args.created_by,
    created_via: "manual",
    updated_by: args.created_by,
    updated_via: "manual",
  });

  return created;
}

export type TransitionSiteVisitArgs = {
  id: string;
  target_state: SiteVisitState;
  actor: string;
  caller_org_id: string;
  reason?: string;
};

export async function transitionSiteVisit(
  args: TransitionSiteVisitArgs,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  if (!UUID_RE.test(args.id)) {
    throw new Error(`Malformed site_visit id: ${args.id}`);
  }
  if (TERMINAL_STATES.has(args.target_state)) {
    if (args.target_state === "no_show" && (!args.reason || !args.reason.trim())) {
      throw new Error("Reason required for no_show transition");
    }
  }

  const lookup = await client
    .from("nodes")
    .select("state, organization_id, workspace_id")
    .eq("id", args.id)
    .eq("node_type", "site_visit")
    .eq("organization_id", args.caller_org_id)
    .is("deleted_at", null)
    .maybeSingle();

  const current = (
    lookup as { data: { state: string; organization_id: string; workspace_id: string } | null }
  ).data;
  if (!current) {
    throw new Error(`Site visit not found or not visible: ${args.id}`);
  }

  const from = current.state as SiteVisitState;
  assertTransitionAllowed(from, args.target_state);

  const upd = await client
    .from("nodes")
    .update({
      state: args.target_state,
      updated_at: new Date().toISOString(),
      updated_by: args.actor,
      updated_via: "manual",
    })
    .eq("id", args.id);

  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new Error(updErr.message);

  await client.from("audit_log").insert({
    actor_id: args.actor,
    actor_type: "user",
    actor_role: "site_visit_writer",
    organization_id: current.organization_id,
    workspace_id: current.workspace_id,
    table_name: "nodes",
    record_id: args.id,
    action: "state_change",
    diff: args.reason
      ? { from, to: args.target_state, reason: args.reason }
      : { from, to: args.target_state },
  });
}

export type UpcomingVisit = {
  id: string;
  organization_id: string;
  workspace_id: string;
  scheduled_at: string;
  lead_id: string;
};

/**
 * Find all `state='scheduled'` site visits whose scheduled_at is
 * within `± 15 min` of `now() + hours_window * 1h`. Org filter is
 * optional — when omitted, the service-role client returns rows
 * across orgs (used by the platform-wide cron sweep).
 */
export async function findUpcomingSiteVisits(
  hours_window: number,
  organization_id: string | null,
  now_ms: number = Date.now(),
  client: SupabaseClient = getSupabaseAdmin()
): Promise<UpcomingVisit[]> {
  const lower = new Date(now_ms + (hours_window * 60 - 15) * 60_000).toISOString();
  const upper = new Date(now_ms + (hours_window * 60 + 15) * 60_000).toISOString();

  let q = client
    .from("nodes")
    .select("id, organization_id, workspace_id, data, state")
    .eq("node_type", "site_visit")
    .eq("state", "scheduled");
  if (organization_id) q = q.eq("organization_id", organization_id);
  q = q
    .is("deleted_at", null)
    .gte("data->>scheduled_at", lower)
    .lte("data->>scheduled_at", upper);

  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    organization_id: string;
    workspace_id: string;
    data: Record<string, unknown> | null;
  }>)
    .map((row) => {
      const d = row.data ?? {};
      const lead_id =
        typeof d.lead_id === "string" ? (d.lead_id as string) : null;
      const scheduled_at =
        typeof d.scheduled_at === "string" ? (d.scheduled_at as string) : null;
      if (!lead_id || !scheduled_at) return null;
      return {
        id: row.id,
        organization_id: row.organization_id,
        workspace_id: row.workspace_id,
        scheduled_at,
        lead_id,
      };
    })
    .filter((v): v is UpcomingVisit => v !== null);
}
