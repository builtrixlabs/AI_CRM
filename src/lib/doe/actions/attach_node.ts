import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectiveRow, Trigger } from "../types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * T1 — attach_node. Inserts an edge between two existing nodes.
 * Caller passes `to_node_id` in trigger.payload (e.g. D-15 walk-in
 * → showroom location node). If `to_node_id` is missing the
 * action returns `attached: false` — runtime logs `outcome='error'`.
 */
export async function attach_node(
  directive: DirectiveRow,
  trigger: Trigger,
  client: SupabaseClient
): Promise<{ attached: boolean; edge_id: string | null }> {
  if (!trigger.subject_node_id) {
    throw new Error(`${directive.code}: attach_node requires subject_node_id`);
  }
  const to_node_id = trigger.payload?.to_node_id;
  if (typeof to_node_id !== "string") {
    return { attached: false, edge_id: null };
  }
  const cfg = directive.action_config ?? {};
  const edge_type =
    typeof cfg.edge_type === "string" ? cfg.edge_type : "related_to";

  const { data, error } = await client
    .from("edges")
    .insert({
      organization_id: trigger.organization_id,
      workspace_id: trigger.workspace_id ?? trigger.organization_id,
      from_node_id: trigger.subject_node_id,
      to_node_id,
      edge_type,
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { attached: false, edge_id: null };
  }
  return { attached: true, edge_id: (data as { id: string }).id };
}
