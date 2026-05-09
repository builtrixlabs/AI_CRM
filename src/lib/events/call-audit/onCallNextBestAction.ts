import type { SupabaseClient } from "@supabase/supabase-js";
import { updateNodeData } from "@/lib/nodes/api";
import { dispatchDirective } from "@/lib/doe/runtime";
import {
  callNextBestActionPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";
import { leadInOrg, readNodeData, SYSTEM_UUID } from "./_shared";

export async function onCallNextBestAction(
  envelope: BuiltrixEvent,
  deps: { client: SupabaseClient }
): Promise<InboxResult> {
  const parsed = callNextBestActionPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: "call.next_best_action payload schema mismatch",
    };
  }
  const payload = parsed.data;

  const tenant = await leadInOrg(
    deps.client,
    envelope.organization_id,
    payload.lead_id
  );
  if (!tenant) {
    return { ok: false, status: "rejected", reason: "lead not found" };
  }

  const leadData = (await readNodeData(deps.client, payload.lead_id)) ?? {};
  const currentCustom = (leadData.custom ?? {}) as Record<string, unknown>;
  const nextCustom: Record<string, unknown> = {
    ...currentCustom,
    next_best_action: {
      ...payload.nba,
      observed_at: envelope.ts,
      source_event_id: envelope.event_id,
    },
  };

  await updateNodeData(
    {
      id: payload.lead_id,
      partial: { custom: nextCustom },
      updated_by: SYSTEM_UUID,
      updated_via: "call_audit",
    },
    deps.client
  );

  await deps.client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "call_audit_event",
    organization_id: envelope.organization_id,
    workspace_id: tenant.workspace_id,
    table_name: "nodes",
    record_id: payload.lead_id,
    action: "next_best_action",
    compiled_artifact: {
      event_kind: envelope.event_kind,
      event_id: envelope.event_id,
      nba: payload.nba,
    },
  });

  await dispatchDirective(
    {
      kind: "call.next_best_action",
      trigger_id: `call.next_best_action:${envelope.event_id}`,
      organization_id: envelope.organization_id,
      workspace_id: tenant.workspace_id,
      subject_node_id: payload.lead_id,
      payload: {
        nba: payload.nba,
        action: payload.nba.action,
        lead_id: payload.lead_id,
        call_id: payload.call_id ?? null,
      },
    },
    { client: deps.client }
  );

  return { ok: true, status: "ok", deduped: false, node_id: payload.lead_id };
}
