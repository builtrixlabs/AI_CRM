import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode } from "@/lib/nodes/api";
import type { DirectiveRow, Trigger } from "../types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * T0 — notify_user. Writes a `note` node with
 * `data.custom.audience` so the dashboard can render an
 * in-app notification. Ride existing realtime; no separate
 * notifications table for V0.
 */
export async function notify_user(
  directive: DirectiveRow,
  trigger: Trigger,
  client: SupabaseClient
): Promise<{ created_node_id: string }> {
  const cfg = directive.action_config ?? {};
  const audience =
    typeof cfg.audience === "string" ? cfg.audience : "assigned_rep";
  const severity =
    typeof cfg.severity === "string" ? cfg.severity : "info";

  const created = await createNode(
    {
      organization_id: trigger.organization_id,
      workspace_id: trigger.workspace_id ?? trigger.organization_id,
      node_type: "note",
      label: `Notify ${audience}: ${directive.display_name}`,
      data: {
        body: `${directive.code}: notify ${audience} (${severity})`,
        custom: {
          subject_node_id: trigger.subject_node_id ?? null,
          audience,
          severity,
          directive_code: directive.code,
          notification: true,
        },
      },
      created_by: SYSTEM_UUID,
      created_via: "system",
    },
    client
  );

  return { created_node_id: created.id };
}
