import type { SupabaseClient } from "@supabase/supabase-js";
import { updateNodeData } from "@/lib/nodes/api";
import type { DirectiveRow, Trigger } from "../types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * T1 — flag_lead. Merges a flag into the lead's `data.custom`.
 * If `also_emit_event` is set, returns the event name so the
 * runtime can fan it out.
 */
export async function flag_lead(
  directive: DirectiveRow,
  trigger: Trigger,
  client: SupabaseClient
): Promise<{ flagged: true; event_to_emit: string | null }> {
  if (!trigger.subject_node_id) {
    throw new Error(
      `${directive.code}: flag_lead requires subject_node_id; trigger has none`
    );
  }
  const cfg = directive.action_config ?? {};
  const flag = typeof cfg.flag === "string" ? cfg.flag : directive.code;
  const severity =
    typeof cfg.severity === "string" ? cfg.severity : "medium";

  const partial: Record<string, unknown> = {
    custom: {
      [`flag_${flag}`]: true,
      [`flag_${flag}_severity`]: severity,
      [`flag_${flag}_at`]: new Date().toISOString(),
      [`flag_${flag}_directive`]: directive.code,
    },
  };

  await updateNodeData(
    {
      id: trigger.subject_node_id,
      partial,
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    },
    client
  );

  return {
    flagged: true,
    event_to_emit:
      typeof cfg.also_emit_event === "string" ? cfg.also_emit_event : null,
  };
}
