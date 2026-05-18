import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DealStage } from "./transitions";
import { DEAL_STAGE_ORDER } from "./transitions";

/**
 * D-321 — deal canvas data + promote-lead-to-deal helper.
 *
 * The canvas is structured panels (header, stage timeline, side info,
 * linked leads, linked units, activity stream). A full graph view is
 * V3.x — for v3 MVP we mirror the LEAD canvas pattern from D-006.
 */

export type DealStageT = DealStage;

const STAGE_SET = new Set<string>(DEAL_STAGE_ORDER);

export function isDealStage(v: unknown): v is DealStage {
  if (v === "lost") return true;
  return typeof v === "string" && STAGE_SET.has(v);
}

export type DealHeader = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  stage: DealStage;
  value_inr: number | null;
  expected_close_at: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DealLinkedLead = {
  id: string;
  label: string;
  state: string | null;
};

export type DealLinkedUnit = {
  id: string;
  unit_no: string;
  status: string;
  property_id: string | null;
};

export type DealActivity = {
  id: string;
  label: string;
  created_at: string;
  created_by: string;
  created_via: string;
  ai_confidence: number | null;
};

export type DealCanvas = {
  deal: DealHeader;
  leads: DealLinkedLead[];
  units: DealLinkedUnit[];
  activities: DealActivity[];
};

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const dealDataSchema = z
  .object({
    value_inr: z.number().min(0).max(1_000_000_000_000).nullable().optional(),
    expected_close_at: z.string().datetime().nullable().optional(),
    owner_id: z.string().uuid().nullable().optional(),
  })
  .passthrough();

export async function getDealCanvas(
  deal_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<DealCanvas | null> {
  if (!UUID_RE.test(deal_id)) return null;

  const { data: dealRow, error: dealErr } = await client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, data, created_at, updated_at"
    )
    .eq("id", deal_id)
    .eq("node_type", "deal")
    .is("deleted_at", null)
    .maybeSingle();
  if (dealErr || !dealRow) return null;

  const row = dealRow as {
    id: string;
    organization_id: string;
    workspace_id: string;
    label: string;
    state: string | null;
    data: unknown;
    created_at: string;
    updated_at: string;
  };
  const parsedData = dealDataSchema.safeParse(row.data ?? {});
  const dataObj = parsedData.success
    ? (parsedData.data as Record<string, unknown>)
    : {};

  const deal: DealHeader = {
    id: row.id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    label: row.label,
    stage: isDealStage(row.state) ? row.state : "qualified",
    value_inr:
      typeof dataObj.value_inr === "number" ? (dataObj.value_inr as number) : null,
    expected_close_at:
      typeof dataObj.expected_close_at === "string"
        ? (dataObj.expected_close_at as string)
        : null,
    owner_id:
      typeof dataObj.owner_id === "string" ? (dataObj.owner_id as string) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Edges from/to this deal — partition by neighbour node_type.
  const { data: edges } = await client
    .from("edges")
    .select("from_node_id, to_node_id, edge_type")
    .or(`from_node_id.eq.${deal_id},to_node_id.eq.${deal_id}`)
    .is("deleted_at", null);

  const neighbourIds = new Set<string>();
  for (const e of (edges ?? []) as Array<{
    from_node_id: string;
    to_node_id: string;
  }>) {
    const other = e.from_node_id === deal_id ? e.to_node_id : e.from_node_id;
    if (other && other !== deal_id) neighbourIds.add(other);
  }

  let leads: DealLinkedLead[] = [];
  let units: DealLinkedUnit[] = [];
  let activities: DealActivity[] = [];

  if (neighbourIds.size > 0) {
    const { data: nodes } = await client
      .from("nodes")
      .select(
        "id, node_type, label, state, data, created_at, created_by, created_via, ai_confidence"
      )
      .in("id", Array.from(neighbourIds))
      .is("deleted_at", null);

    for (const n of (nodes ?? []) as Array<{
      id: string;
      node_type: string;
      label: string;
      state: string | null;
      data: Record<string, unknown> | null;
      created_at: string;
      created_by: string;
      created_via: string;
      ai_confidence: number | null;
    }>) {
      if (n.node_type === "lead") {
        leads.push({ id: n.id, label: n.label, state: n.state });
      } else if (n.node_type === "unit") {
        units.push({
          id: n.id,
          unit_no: ((n.data?.unit_no as string | undefined) ?? "—"),
          status: n.state ?? "available",
          property_id:
            (n.data?.property_id as string | undefined) ?? null,
        });
      } else if (n.node_type === "activity") {
        activities.push({
          id: n.id,
          label: n.label,
          created_at: n.created_at,
          created_by: n.created_by,
          created_via: n.created_via,
          ai_confidence: n.ai_confidence,
        });
      }
    }
  }

  // Stable order for UI rendering.
  leads.sort((a, b) => a.label.localeCompare(b.label));
  units.sort((a, b) => a.unit_no.localeCompare(b.unit_no));
  activities.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  );

  return { deal, leads, units, activities };
}

export type PromoteLeadResult =
  | { ok: true; deal_id: string }
  | { ok: false; error: "not_found" | "permission" | "internal"; message?: string };

export async function promoteLeadToDeal(
  input: {
    lead_id: string;
    organization_id: string;
    workspace_id: string;
    caller_id: string;
    label?: string;
  },
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PromoteLeadResult> {
  // 1. Fetch lead to verify it exists + tenant matches.
  const { data: lead } = await client
    .from("nodes")
    .select("id, label, state, organization_id, workspace_id")
    .eq("id", input.lead_id)
    .eq("node_type", "lead")
    .eq("organization_id", input.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead) return { ok: false, error: "not_found" };

  // 2. Insert the deal node (state = "qualified" — stage machine entry).
  const dealLabel =
    input.label ??
    `Deal — ${(lead as { label: string }).label}`;
  const { data: dealRow, error: dealErr } = await client
    .from("nodes")
    .insert({
      organization_id: input.organization_id,
      workspace_id: input.workspace_id,
      node_type: "deal",
      label: dealLabel,
      state: "qualified",
      data: { promoted_from_lead_id: input.lead_id },
      created_by: input.caller_id,
      created_via: "manual",
      updated_by: input.caller_id,
      updated_via: "manual",
    })
    .select("id")
    .single();
  if (dealErr || !dealRow) {
    return { ok: false, error: "internal", message: dealErr?.message };
  }
  const deal_id = (dealRow as { id: string }).id;

  // 3. Edge: deal -> lead.
  await client.from("edges").insert({
    organization_id: input.organization_id,
    from_node_id: deal_id,
    to_node_id: input.lead_id,
    edge_type: "deal_to_lead",
    created_by: input.caller_id,
    created_via: "manual",
  });

  // 4. Audit row.
  await client.from("audit_log").insert({
    actor_id: input.caller_id,
    actor_type: "user",
    actor_role: "sales_rep",
    organization_id: input.organization_id,
    workspace_id: input.workspace_id,
    table_name: "nodes",
    record_id: deal_id,
    action: "deal_promoted_from_lead",
    diff: { lead_id: input.lead_id, deal_label: dealLabel },
  });

  return { ok: true, deal_id };
}
