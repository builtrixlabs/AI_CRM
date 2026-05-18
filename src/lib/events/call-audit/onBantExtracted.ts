import type { SupabaseClient } from "@supabase/supabase-js";
import { updateNodeData } from "@/lib/nodes/api";
import { dispatchDirective } from "@/lib/doe/runtime";
import {
  bantExtractedPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";
import { leadInOrg, readNodeData, SYSTEM_UUID } from "./_shared";

export async function onBantExtracted(
  envelope: BuiltrixEvent,
  deps: { client: SupabaseClient }
): Promise<InboxResult> {
  const parsed = bantExtractedPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: "call.bant_extracted payload schema mismatch",
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
  const currentBant = (currentCustom.bant ?? {}) as Record<string, unknown>;
  const nextCustom: Record<string, unknown> = {
    ...currentCustom,
    bant: {
      ...currentBant,
      ai: {
        ...payload.bant,
        observed_at: envelope.ts,
        source_event_id: envelope.event_id,
      },
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
    action: "bant_extracted",
    compiled_artifact: {
      event_kind: envelope.event_kind,
      event_id: envelope.event_id,
      bant: payload.bant,
    },
  });

  await dispatchDirective(
    {
      kind: "call.bant_extracted",
      trigger_id: `call.bant_extracted:${envelope.event_id}`,
      organization_id: envelope.organization_id,
      workspace_id: tenant.workspace_id,
      subject_node_id: payload.lead_id,
      payload: {
        bant: payload.bant,
        score: payload.bant.score ?? null,
        lead_id: payload.lead_id,
        call_id: payload.call_id ?? null,
      },
    },
    { client: deps.client }
  );

  return { ok: true, status: "ok", deduped: false, node_id: payload.lead_id };
}
