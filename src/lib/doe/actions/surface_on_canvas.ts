import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode } from "@/lib/nodes/api";
import type { DirectiveRow, Trigger } from "../types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * T0 — surface_on_canvas. Writes a `note` node attached to the
 * subject lead with `data.kind` = the action_config.kind. Reps see
 * this on the Lead canvas via the activity stream.
 */
export async function surface_on_canvas(
  directive: DirectiveRow,
  trigger: Trigger,
  client: SupabaseClient
): Promise<{ created_node_id: string }> {
  const cfg = directive.action_config ?? {};
  const kind = typeof cfg.kind === "string" ? cfg.kind : "directive";
  const title = typeof cfg.title === "string" ? cfg.title : directive.display_name;

  const created = await createNode(
    {
      organization_id: trigger.organization_id,
      workspace_id: trigger.workspace_id ?? trigger.organization_id, // fallback for system flows
      node_type: "note",
      label: title,
      data: {
        body: `${directive.code}: ${title}`,
        custom: {
          subject_node_id: trigger.subject_node_id ?? null,
          directive_id: directive.id,
          directive_code: directive.code,
          surface_kind: kind,
        },
      },
      created_by: SYSTEM_UUID,
      created_via: "system",
    },
    client
  );

  if (trigger.subject_node_id) {
    await client.from("edges").insert({
      organization_id: trigger.organization_id,
      workspace_id: trigger.workspace_id ?? trigger.organization_id,
      from_node_id: created.id,
      to_node_id: trigger.subject_node_id,
      edge_type: "mentioned_in",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    });
  }

  return { created_node_id: created.id };
}
