import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchDirective } from "@/lib/doe/runtime";
import {
  callComplianceFlagPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";
import { leadInOrg, SYSTEM_UUID } from "./_shared";

export async function onCallComplianceFlag(
  envelope: BuiltrixEvent,
  deps: { client: SupabaseClient }
): Promise<InboxResult> {
  const parsed = callComplianceFlagPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: "call.compliance_flag payload schema mismatch",
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

  await deps.client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "call_audit_event",
    organization_id: envelope.organization_id,
    workspace_id: tenant.workspace_id,
    table_name: "nodes",
    record_id: payload.call_id ?? payload.lead_id,
    action: "call_compliance_flag",
    compiled_artifact: {
      event_kind: envelope.event_kind,
      event_id: envelope.event_id,
      flag: payload.flag,
    },
  });

  // Only dispatch DOE for HIGH severity (D-VIQ-03 default ceiling).
  if (payload.flag.severity === "high") {
    await dispatchDirective(
      {
        kind: "call.compliance_flag",
        trigger_id: `call.compliance_flag:${envelope.event_id}`,
        organization_id: envelope.organization_id,
        workspace_id: tenant.workspace_id,
        subject_node_id: payload.lead_id,
        payload: {
          flag: payload.flag,
          severity: payload.flag.severity,
          code: payload.flag.code,
          lead_id: payload.lead_id,
          call_id: payload.call_id ?? null,
        },
      },
      { client: deps.client }
    );
  }

  return { ok: true, status: "ok", deduped: false, node_id: payload.lead_id };
}
