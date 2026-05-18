import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchDirective } from "@/lib/doe/runtime";
import {
  leadIntentChangedPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";
import { leadInOrg, SYSTEM_UUID } from "./_shared";

async function intentSignalAlreadyExists(
  client: SupabaseClient,
  organization_id: string,
  source_event_id: string
): Promise<boolean> {
  const { data, error } = await client
    .from("node_signals")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("signal_type", "intent")
    .eq("source_event_id", source_event_id)
    .limit(1);
  if (error || !data) return false;
  return data.length > 0;
}

export async function onLeadIntentChanged(
  envelope: BuiltrixEvent,
  deps: { client: SupabaseClient }
): Promise<InboxResult> {
  const parsed = leadIntentChangedPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: "lead.intent_changed payload schema mismatch",
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

  const score = payload.intent.intent_capture_score;
  if (typeof score !== "number") {
    return {
      ok: false,
      status: "rejected",
      reason: "intent_capture_score missing",
    };
  }

  // Event-id dedup — re-POST is a no-op for the signal write.
  const dup = await intentSignalAlreadyExists(
    deps.client,
    envelope.organization_id,
    envelope.event_id
  );

  if (!dup) {
    await deps.client.from("node_signals").insert({
      organization_id: envelope.organization_id,
      workspace_id: tenant.workspace_id,
      node_id: payload.lead_id,
      signal_type: "intent",
      signal_value: score,
      computed_by: SYSTEM_UUID,
      created_by: SYSTEM_UUID,
      created_via: "call_audit",
      updated_by: SYSTEM_UUID,
      updated_via: "call_audit",
      source_event_id: envelope.event_id,
      ai_confidence: payload.intent.ai_confidence ?? null,
    });
  }

  await deps.client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "call_audit_event",
    organization_id: envelope.organization_id,
    workspace_id: tenant.workspace_id,
    table_name: "node_signals",
    record_id: payload.lead_id,
    action: dup ? "intent_changed_replay" : "intent_changed",
    compiled_artifact: {
      event_kind: envelope.event_kind,
      event_id: envelope.event_id,
      score,
      label: payload.intent.label ?? null,
    },
  });

  await dispatchDirective(
    {
      kind: "lead.intent_changed",
      trigger_id: `lead.intent_changed:${envelope.event_id}`,
      organization_id: envelope.organization_id,
      workspace_id: tenant.workspace_id,
      subject_node_id: payload.lead_id,
      payload: {
        score,
        // Score is normalized 0-1; threshold cfg is on a 0-100 scale.
        // Translate so existing condition evaluator (`threshold` checks
        // `payload.score`) compares on the same axis.
        score_pct: Math.round(score * 100),
        value: Math.round(score * 100),
        label: payload.intent.label ?? null,
        lead_id: payload.lead_id,
      },
    },
    { client: deps.client }
  );

  return { ok: true, status: "ok", deduped: false, node_id: payload.lead_id };
}
