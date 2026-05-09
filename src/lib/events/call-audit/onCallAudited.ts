import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode, updateNodeData } from "@/lib/nodes/api";
import { dispatchDirective } from "@/lib/doe/runtime";
import {
  callAuditedPayloadSchema,
  type BuiltrixEvent,
  type CallAuditedPayload,
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

function buildCallNodeData(
  payload: CallAuditedPayload,
  envelope: BuiltrixEvent
) {
  // call schema is `.strict()`, so v2 fields live in `custom`.
  const v2: Record<string, unknown> = {};
  if (payload.schema_version) v2.schema_version = payload.schema_version;
  if (payload.bant) v2.bant = payload.bant;
  if (payload.intent) v2.intent = payload.intent;
  if (payload.scoring) v2.scoring = payload.scoring;
  if (payload.competitors_mentioned)
    v2.competitors_mentioned = payload.competitors_mentioned;
  if (payload.objections) v2.objections = payload.objections;
  if (payload.compliance) v2.compliance = payload.compliance;
  if (payload.next_best_action) v2.next_best_action = payload.next_best_action;

  return {
    lead_id: payload.lead_id,
    direction: payload.direction,
    duration_seconds: payload.duration_seconds,
    recording_url: payload.recording_url,
    summary: payload.summary,
    custom: {
      source_event_id: envelope.event_id,
      source_product: envelope.source_product,
      ...v2,
    },
  };
}

function dedupeCaseInsensitive(items: string[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    const key = item.toLowerCase().trim();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, item.trim());
  }
  return Array.from(seen.values());
}

async function liftToLead(
  client: SupabaseClient,
  lead_id: string,
  payload: CallAuditedPayload,
  envelope: BuiltrixEvent
): Promise<void> {
  const hasBant = !!payload.bant;
  const hasCompetitors =
    !!payload.competitors_mentioned && payload.competitors_mentioned.length > 0;
  if (!hasBant && !hasCompetitors) return;

  const { data: existing, error } = await client
    .from("nodes")
    .select("data")
    .eq("id", lead_id)
    .single();
  if (error || !existing) return;

  const leadData = (existing.data ?? {}) as Record<string, unknown>;
  const currentCustom = (leadData.custom ?? {}) as Record<string, unknown>;
  const nextCustom: Record<string, unknown> = { ...currentCustom };

  if (hasBant) {
    const currentBant = (currentCustom.bant ?? {}) as Record<string, unknown>;
    nextCustom.bant = {
      ...currentBant,
      ai: {
        ...payload.bant,
        observed_at: envelope.ts,
        source_event_id: envelope.event_id,
      },
    };
  }

  if (hasCompetitors) {
    const previous = Array.isArray(currentCustom.competitors)
      ? (currentCustom.competitors as string[])
      : [];
    nextCustom.competitors = dedupeCaseInsensitive([
      ...previous,
      ...(payload.competitors_mentioned ?? []),
    ]);
  }

  await updateNodeData(
    {
      id: lead_id,
      partial: { custom: nextCustom },
      updated_by: SYSTEM_UUID,
      updated_via: "call_audit",
    },
    client
  );
}

async function recordIntentSignal(
  client: SupabaseClient,
  organization_id: string,
  workspace_id: string,
  lead_id: string,
  envelope: BuiltrixEvent,
  payload: CallAuditedPayload
): Promise<void> {
  const score = payload.intent?.intent_capture_score;
  if (typeof score !== "number") return;
  await client.from("node_signals").insert({
    organization_id,
    workspace_id,
    node_id: lead_id,
    signal_type: "intent",
    signal_value: score,
    computed_by: SYSTEM_UUID,
    created_by: SYSTEM_UUID,
    created_via: "call_audit",
    updated_by: SYSTEM_UUID,
    updated_via: "call_audit",
    source_event_id: envelope.event_id,
    ai_confidence: payload.intent?.ai_confidence ?? null,
  });
}

async function dispatchObjections(
  client: SupabaseClient,
  envelope: BuiltrixEvent,
  workspace_id: string,
  call_node_id: string,
  payload: CallAuditedPayload
): Promise<void> {
  const objections = payload.objections ?? [];
  if (objections.length === 0) return;
  for (let i = 0; i < objections.length; i++) {
    const item = objections[i];
    await dispatchDirective(
      {
        kind: "call.objection_detected",
        trigger_id: `call.objection_detected:${envelope.event_id}:${i}`,
        organization_id: envelope.organization_id,
        workspace_id,
        subject_node_id: payload.lead_id,
        payload: {
          objection: item.text,
          severity: item.severity ?? "medium",
          call_id: call_node_id,
          lead_id: payload.lead_id,
        },
      },
      { client }
    );
  }
}

async function auditComplianceHigh(
  client: SupabaseClient,
  organization_id: string,
  workspace_id: string,
  call_node_id: string,
  envelope: BuiltrixEvent,
  payload: CallAuditedPayload
): Promise<void> {
  const flags = payload.compliance?.flags ?? [];
  const high = flags.filter((f) => f.severity === "high");
  if (high.length === 0) return;
  await client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "call_audit_event",
    organization_id,
    workspace_id,
    table_name: "nodes",
    record_id: call_node_id,
    action: "call_compliance_flag_high",
    compiled_artifact: {
      event_kind: envelope.event_kind,
      event_id: envelope.event_id,
      flags: high,
    },
  });
}

export async function onCallAudited(
  envelope: BuiltrixEvent,
  deps: { client: SupabaseClient }
): Promise<InboxResult> {
  const parsed = callAuditedPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: "call.audited payload schema mismatch",
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

  const created = await createNode(
    {
      organization_id: envelope.organization_id,
      workspace_id: tenant.workspace_id,
      node_type: "call",
      label: `Call · ${payload.duration_seconds}s · ${payload.direction}`,
      data: buildCallNodeData(payload, envelope),
      created_by: SYSTEM_UUID,
      created_via: "call_audit",
    },
    deps.client
  );

  await deps.client.from("edges").insert({
    organization_id: envelope.organization_id,
    workspace_id: tenant.workspace_id,
    from_node_id: created.id,
    to_node_id: payload.lead_id,
    edge_type: "mentioned_in",
    created_by: SYSTEM_UUID,
    created_via: "call_audit",
    updated_by: SYSTEM_UUID,
    updated_via: "call_audit",
  });

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
      lead_id: payload.lead_id,
      schema_version: payload.schema_version ?? "v1",
    },
  });

  // v2 lifts — each is a no-op when its trigger field is absent.
  await liftToLead(deps.client, payload.lead_id, payload, envelope);
  await recordIntentSignal(
    deps.client,
    envelope.organization_id,
    tenant.workspace_id,
    payload.lead_id,
    envelope,
    payload
  );
  await dispatchObjections(
    deps.client,
    envelope,
    tenant.workspace_id,
    created.id,
    payload
  );
  await auditComplianceHigh(
    deps.client,
    envelope.organization_id,
    tenant.workspace_id,
    created.id,
    envelope,
    payload
  );

  return { ok: true, status: "ok", deduped: false, node_id: created.id };
}
