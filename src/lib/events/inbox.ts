import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { envelopeSchema, type BuiltrixEvent, type InboxResult } from "./types";
import { onCallAudited } from "./call-audit/onCallAudited";
import { onCallObjectionDetected } from "./call-audit/onCallObjectionDetected";
import { onBantExtracted } from "./call-audit/onBantExtracted";
import { onLeadIntentChanged } from "./call-audit/onLeadIntentChanged";
import { onCallComplianceFlag } from "./call-audit/onCallComplianceFlag";
import { onCallNextBestAction } from "./call-audit/onCallNextBestAction";
import { onLeadIngested } from "./lead-sources";

export type DispatchDeps = {
  client?: SupabaseClient;
};

export type LedgerInput = {
  organization_id: string | null;
  event_id: string;
  event_kind: string;
  source_product: string;
  status: "ok" | "deduped" | "rejected" | "error";
  reason?: string | null;
  resulting_node_id?: string | null;
};

export async function recordInboxIngestion(
  input: LedgerInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const { error } = await client.from("event_inbox_log").insert({
    organization_id: input.organization_id,
    event_id: input.event_id,
    event_kind: input.event_kind,
    source_product: input.source_product,
    status: input.status,
    reason: input.reason ?? null,
    resulting_node_id: input.resulting_node_id ?? null,
  });
  if (error) {
    console.warn("[event_inbox_log] insert failed", error.message);
  }
}

/** Look up a `call`/`document` node already created for this `event_id`. */
export async function findExistingNodeForEvent(
  client: SupabaseClient,
  organization_id: string,
  event_id: string
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("nodes")
    .select("id")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .eq("data->custom->>source_event_id", event_id)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: (data[0] as { id: string }).id };
}

/**
 * D-443 — look up a prior inbox-log entry for an (org, event_id) pair.
 * Sister-product events don't create nodes, so the call-audit-style node
 * dedup doesn't apply; we instead look at the event_inbox_log directly.
 * Returns the prior log status so the caller can short-circuit.
 */
export async function findExistingInboxLogEvent(
  client: SupabaseClient,
  organization_id: string,
  event_id: string
): Promise<{ status: "ok" | "deduped" | "rejected" | "error" } | null> {
  const { data, error } = await client
    .from("event_inbox_log")
    .select("status")
    .eq("organization_id", organization_id)
    .eq("event_id", event_id)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as { status: "ok" | "deduped" | "rejected" | "error" };
}

const SISTER_PRODUCT_EVENT_KINDS = new Set(["lead.ingested"]);

export async function dispatchInboxEvent(
  envelope: BuiltrixEvent,
  deps: DispatchDeps = {}
): Promise<InboxResult> {
  const client = deps.client ?? getSupabaseAdmin();

  const validated = envelopeSchema.safeParse(envelope);
  if (!validated.success) {
    return {
      ok: false,
      status: "rejected",
      reason: "envelope schema mismatch",
    };
  }

  // D-443: sister-product events dedupe via event_inbox_log because they
  // don't create nodes. Call-audit / Voice IQ events stay on the legacy
  // node-based dedup.
  if (SISTER_PRODUCT_EVENT_KINDS.has(envelope.event_kind)) {
    const priorLog = await findExistingInboxLogEvent(
      client,
      envelope.organization_id,
      envelope.event_id
    );
    if (priorLog) {
      return {
        ok: true,
        status: "deduped",
        deduped: true,
        node_id: null,
      };
    }
  } else {
    const dedup = await findExistingNodeForEvent(
      client,
      envelope.organization_id,
      envelope.event_id
    );
    if (dedup) {
      await recordInboxIngestion(
        {
          organization_id: envelope.organization_id,
          event_id: envelope.event_id,
          event_kind: envelope.event_kind,
          source_product: envelope.source_product,
          status: "deduped",
          resulting_node_id: dedup.id,
        },
        client
      );
      return {
        ok: true,
        status: "deduped",
        deduped: true,
        node_id: dedup.id,
      };
    }
  }

  // Route by event_kind.
  let result: InboxResult;
  try {
    if (envelope.event_kind === "call.audited") {
      result = await onCallAudited(envelope, { client });
    } else if (envelope.event_kind === "call.objection_detected") {
      result = await onCallObjectionDetected(envelope, { client });
    } else if (envelope.event_kind === "call.bant_extracted") {
      result = await onBantExtracted(envelope, { client });
    } else if (envelope.event_kind === "lead.intent_changed") {
      result = await onLeadIntentChanged(envelope, { client });
    } else if (envelope.event_kind === "call.compliance_flag") {
      result = await onCallComplianceFlag(envelope, { client });
    } else if (envelope.event_kind === "call.next_best_action") {
      result = await onCallNextBestAction(envelope, { client });
    } else if (envelope.event_kind === "lead.ingested") {
      result = await onLeadIngested(envelope, { client });
    } else {
      result = {
        ok: false,
        status: "rejected",
        reason: `unsupported event_kind: ${envelope.event_kind}`,
      };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    result = { ok: false, status: "error", reason };
  }

  await recordInboxIngestion(
    {
      organization_id: envelope.organization_id,
      event_id: envelope.event_id,
      event_kind: envelope.event_kind,
      source_product: envelope.source_product,
      status: result.ok ? "ok" : (result.status === "rejected" ? "rejected" : "error"),
      reason: result.ok ? null : result.reason,
      resulting_node_id: result.ok ? result.node_id : null,
    },
    client
  );

  return result;
}
