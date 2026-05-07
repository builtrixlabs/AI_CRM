import type { SupabaseClient } from "@supabase/supabase-js";
import { leadSchema } from "@/lib/nodes/schemas/lead";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AgentTier, CanvasActivity, CanvasData, CanvasLead } from "./types";

/** Default activity-row fetch limit; baseline 112 documents this. */
export const DEFAULT_ACTIVITY_LIMIT = 50;

/** Edge types that connect an activity to its lead/deal. */
export const ACTIVITY_EDGE_TYPES = [
  "mentioned_in",
  "related_to",
  "belongs_to",
] as const;

/**
 * Format a Supabase Realtime channel name for a lead's canvas.
 * Locked into baseline 112: `canvas:lead:<lead_id>`.
 */
export function leadCanvasChannel(lead_id: string): string {
  return `canvas:lead:${lead_id}`;
}

const TIER_VALUES: ReadonlySet<string> = new Set([
  "T0",
  "T1",
  "T2",
  "T3",
  "T4",
]);

function coerceTier(value: unknown): AgentTier | null {
  if (typeof value !== "string") return null;
  return TIER_VALUES.has(value) ? (value as AgentTier) : null;
}

type LeadRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  state: string;
  data: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  node_type: string;
};

type ActivityRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  data: unknown;
  created_at: string;
  created_by: string;
  created_via: string;
  ai_confidence: number | null;
  agent_tier?: string | null;
};

type EdgeRow = {
  from_node_id: string;
  to_node_id: string;
};

function isLeadDataValid(data: unknown): boolean {
  return leadSchema.safeParse(data).success;
}

/**
 * Fetch a lead + its most-recent activity nodes for canvas rendering.
 *
 * Uses the request-scoped Supabase server client by default; RLS scopes
 * the query to the caller's (org_id, workspace_id) JWT claims, so a
 * cross-tenant lead returns null without a 403 leak.
 *
 * Schema-mismatched data on the lead row does NOT throw — the caller
 * (canvas component) renders a fallback. Validation here is best-effort.
 *
 * Activity nodes' `agent_tier` is derived by joining `audit_log` for
 * the most recent agent action on each activity. If the join is unavailable
 * (RLS, missing rows), `agent_tier` falls back to null.
 */
export async function getLeadCanvas(
  lead_id: string,
  client?: SupabaseClient
): Promise<CanvasData | null> {
  const supabase = client ?? (await createSupabaseServerClient());

  const leadResult = await supabase
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, data, created_at, updated_at, deleted_at, node_type"
    )
    .eq("id", lead_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .maybeSingle();

  if (leadResult.error || !leadResult.data) return null;

  const leadRow = leadResult.data as LeadRow;
  const lead: CanvasLead = {
    id: leadRow.id,
    organization_id: leadRow.organization_id,
    workspace_id: leadRow.workspace_id,
    label: leadRow.label,
    state: leadRow.state,
    data: (isLeadDataValid(leadRow.data) ? leadRow.data : {}) as CanvasLead["data"],
    created_at: leadRow.created_at,
    updated_at: leadRow.updated_at,
  };

  const edgesResult = await supabase
    .from("edges")
    .select("from_node_id, to_node_id")
    .or(`from_node_id.eq.${lead_id},to_node_id.eq.${lead_id}`)
    .in("edge_type", ACTIVITY_EDGE_TYPES as unknown as string[])
    .is("deleted_at", null);

  if (edgesResult.error) {
    return { lead, activities: [] };
  }

  const edgeRows = (edgesResult.data ?? []) as EdgeRow[];
  const activityIds = new Set<string>();
  for (const edge of edgeRows) {
    const other = edge.from_node_id === lead_id ? edge.to_node_id : edge.from_node_id;
    if (other && other !== lead_id) activityIds.add(other);
  }

  if (activityIds.size === 0) {
    return { lead, activities: [] };
  }

  const activitiesResult = await supabase
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, data, created_at, created_by, created_via, ai_confidence, agent_tier"
    )
    .in("id", Array.from(activityIds))
    .eq("node_type", "activity")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(DEFAULT_ACTIVITY_LIMIT);

  if (activitiesResult.error || !activitiesResult.data) {
    return { lead, activities: [] };
  }

  const activities: CanvasActivity[] = (activitiesResult.data as ActivityRow[]).map(
    (row) => ({
      id: row.id,
      organization_id: row.organization_id,
      workspace_id: row.workspace_id,
      label: row.label,
      data: (row.data ?? {}) as Record<string, unknown>,
      created_at: row.created_at,
      created_by: row.created_by,
      created_via: row.created_via,
      ai_confidence: row.ai_confidence,
      agent_tier: coerceTier(row.agent_tier),
    })
  );

  return { lead, activities };
}
