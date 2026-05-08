import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode } from "@/lib/nodes/api";
import { dispatchDirective } from "@/lib/doe/runtime";
import {
  callObjectionPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

async function leadInOrg(
  client: SupabaseClient,
  organization_id: string,
  lead_id: string
): Promise<{ workspace_id: string } | null> {
  const { data, error } = await client
    .from("nodes")
    .select("workspace_id")
    .eq("id", lead_id)
    .eq("node_type", "lead")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return { workspace_id: (data as { workspace_id: string }).workspace_id };
}

export async function onCallObjectionDetected(
  envelope: BuiltrixEvent,
  deps: { client: SupabaseClient }
): Promise<InboxResult> {
  const parsed = callObjectionPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: "call.objection_detected payload schema mismatch",
    };
  }

  const tenant = await leadInOrg(
    deps.client,
    envelope.organization_id,
    parsed.data.lead_id
  );
  if (!tenant) {
    return { ok: false, status: "rejected", reason: "lead not found" };
  }

  // 1. Create the call node.
  const created = await createNode(
    {
      organization_id: envelope.organization_id,
      workspace_id: tenant.workspace_id,
      node_type: "call",
      label: `Call · objection: ${parsed.data.objection}`,
      data: {
        lead_id: parsed.data.lead_id,
        direction: parsed.data.direction,
        duration_seconds: parsed.data.duration_seconds,
        summary: parsed.data.summary,
        objection_detected: parsed.data.objection,
        custom: {
          source_event_id: envelope.event_id,
          source_product: envelope.source_product,
        },
      },
      created_by: SYSTEM_UUID,
      created_via: "call_audit",
    },
    deps.client
  );

  await deps.client.from("edges").insert({
    organization_id: envelope.organization_id,
    workspace_id: tenant.workspace_id,
    from_node_id: created.id,
    to_node_id: parsed.data.lead_id,
    edge_type: "mentioned_in",
    created_by: SYSTEM_UUID,
    created_via: "call_audit",
    updated_by: SYSTEM_UUID,
    updated_via: "call_audit",
  });

  // 2. Audit row.
  await deps.client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "call_audit_event",
    organization_id: envelope.organization_id,
    workspace_id: tenant.workspace_id,
    table_name: "nodes",
    record_id: created.id,
    action: "event_inbound",
    compiled_artifact: {
      event_kind: envelope.event_kind,
      event_id: envelope.event_id,
      objection: parsed.data.objection,
    },
  });

  // 3. Dispatch DOE — D-09 fires for objection='price'.
  await dispatchDirective(
    {
      kind: "call.objection_detected",
      trigger_id: `call.objection_detected:${envelope.event_id}`,
      organization_id: envelope.organization_id,
      workspace_id: tenant.workspace_id,
      subject_node_id: parsed.data.lead_id,
      payload: {
        objection: parsed.data.objection,
        call_id: created.id,
        lead_id: parsed.data.lead_id,
      },
    },
    { client: deps.client }
  );

  return { ok: true, status: "ok", deduped: false, node_id: created.id };
}
