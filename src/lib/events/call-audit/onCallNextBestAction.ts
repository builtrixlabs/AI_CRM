import type { SupabaseClient } from "@supabase/supabase-js";
import { updateNodeData } from "@/lib/nodes/api";
import { dispatchDirective } from "@/lib/doe/runtime";
import { inngest } from "@/lib/inngest/client";
import { isBrochureAction } from "@/lib/agents/brochure-agent";
import { isSiteVisitBookingAction } from "@/lib/agents/site-visit-agent";
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

  // D-600 — when the next-best-action asks for project material, fan out
  // to the Brochure Agent via Inngest. Best-effort: a send failure logs
  // but never fails the event handler (best-effort-event-emit).
  if (isBrochureAction(payload.nba.action)) {
    try {
      await inngest.send({
        name: "agent/brochure.requested",
        data: {
          organization_id: envelope.organization_id,
          lead_id: payload.lead_id,
          nba_action: payload.nba.action,
          call_id: payload.call_id ?? null,
        },
      });
    } catch (err) {
      console.warn(
        "[onCallNextBestAction] brochure agent emit failed",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // D-601 — when the next-best-action asks to book a site visit, fan out
  // to the Site Visit Booking Agent via Inngest. Best-effort, same as the
  // brochure emit (best-effort-event-emit).
  if (isSiteVisitBookingAction(payload.nba.action)) {
    try {
      await inngest.send({
        name: "agent/site_visit.requested",
        data: {
          organization_id: envelope.organization_id,
          lead_id: payload.lead_id,
          nba_action: payload.nba.action,
          call_id: payload.call_id ?? null,
        },
      });
    } catch (err) {
      console.warn(
        "[onCallNextBestAction] site visit agent emit failed",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return { ok: true, status: "ok", deduped: false, node_id: payload.lead_id };
}
