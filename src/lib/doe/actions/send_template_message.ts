import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode } from "@/lib/nodes/api";
import type { DirectiveRow, Trigger } from "../types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * T2 — send_template_message. V0 writes an `activity` node
 * `kind='whatsapp'` with `data.custom.template_id` and stub body.
 * Real outbound to the provider lands in a future directive
 * (D-016 superadmin AI provider config + D-017 outbound).
 *
 * The activity edges to the subject lead so the canvas reflects
 * the sent message immediately.
 */
export async function send_template_message(
  directive: DirectiveRow,
  trigger: Trigger,
  client: SupabaseClient
): Promise<{ activity_id: string; template_id: string }> {
  const cfg = directive.action_config ?? {};
  const template_id =
    typeof cfg.template_id === "string" ? cfg.template_id : "T-UNKNOWN";
  const channel =
    typeof cfg.channel === "string" ? cfg.channel : "whatsapp";

  const summary = `Auto: ${directive.code} sent template ${template_id}`;
  const body = `[stub] template_id=${template_id}, channel=${channel}, directive=${directive.code}`;

  const created = await createNode(
    {
      organization_id: trigger.organization_id,
      workspace_id: trigger.workspace_id ?? trigger.organization_id,
      node_type: "activity",
      label: summary,
      data: {
        subject_node_id: trigger.subject_node_id ?? trigger.organization_id,
        kind: channel === "email" ? "email" : "whatsapp",
        summary,
        body,
        custom: {
          template_id,
          channel,
          directive_code: directive.code,
          stub: true,
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

  return { activity_id: created.id, template_id };
}
