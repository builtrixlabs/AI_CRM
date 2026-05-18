/**
 * V3.x — emit-on-event wrapper that fans out to subscribed webhook endpoints.
 *
 * D-311 shipped the delivery worker; D-208 stored endpoints with an
 * `events_subscribed` JSONB array. The missing piece was: who calls
 * `enqueueDelivery`? V3.x backlog items 15 + 16. This module is that
 * producer-side seam.
 *
 *   await emitEvent("org-uuid", "lead.created", { lead_id: "..." })
 *
 * Behaviour:
 *   1. Look up enabled, non-disabled, non-deleted endpoints for the org.
 *   2. Filter to endpoints whose events_subscribed JSON array contains
 *      the event_kind (per-event-kind enforcement, item 16).
 *   3. Call enqueueDelivery for each. Errors logged in the per-endpoint
 *      result; one failure does not stop the others.
 *
 * Idempotent at the producer level only when the caller passes a stable
 * payload. Delivery dedup at the worker is out of scope (V3.x part 2).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enqueueDelivery } from "./deliver";
import { isSisterProductEventKind } from "@/lib/integrations/sister-products/event-kinds";

// D-442 — surface drift: warn-only when an emit slips in with a kind outside
// the canonical sister-product enum. We don't reject because v3 emit sites
// (call_audit / voice_iq) still legitimately use their own kinds; this is a
// "this is probably new and undocumented" signal, not a guard rail.
function maybeWarnUnknownKind(event_kind: string): void {
  if (
    event_kind.includes(".") &&
    !isSisterProductEventKind(event_kind) &&
    !event_kind.startsWith("call.") &&
    !event_kind.startsWith("voice_iq.") &&
    !event_kind.startsWith("legal.")
  ) {
    console.warn(
      `[emit-event] unknown_event_kind: ${event_kind} (not in canonical sister-product enum; add to src/lib/integrations/sister-products/event-kinds.ts if it should be subscribable)`,
    );
  }
}

export type EmitResult = {
  total_endpoints: number;
  matched_endpoints: number;
  enqueued: number;
  per_endpoint: Array<{
    endpoint_id: string;
    delivery_id: string | null;
    error: string | null;
  }>;
};

type EndpointRow = {
  id: string;
  events_subscribed: unknown; // jsonb — runtime-checked
};

/**
 * Returns true if the JSON array of subscribed kinds contains the kind.
 * Tolerates the legacy "*" wildcard, plain string entries, and exotic
 * non-string members (silently ignored).
 */
export function isSubscribed(events_subscribed: unknown, kind: string): boolean {
  if (!Array.isArray(events_subscribed)) return false;
  for (const v of events_subscribed) {
    if (typeof v !== "string") continue;
    if (v === kind || v === "*") return true;
    // Allow prefix wildcard `lead.*` matching `lead.created`.
    if (v.endsWith(".*") && kind.startsWith(v.slice(0, -1))) return true;
  }
  return false;
}

export async function emitEvent(
  organization_id: string,
  event_kind: string,
  payload: Record<string, unknown>,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<EmitResult> {
  maybeWarnUnknownKind(event_kind);
  const result: EmitResult = {
    total_endpoints: 0,
    matched_endpoints: 0,
    enqueued: 0,
    per_endpoint: [],
  };

  const { data: endpoints, error } = await client
    .from("webhook_endpoints")
    .select("id, events_subscribed")
    .eq("organization_id", organization_id)
    .eq("enabled", true)
    .is("disabled_at", null)
    .is("deleted_at", null);
  if (error || !endpoints) return result;

  result.total_endpoints = endpoints.length;

  for (const ep of endpoints as EndpointRow[]) {
    if (!isSubscribed(ep.events_subscribed, event_kind)) continue;
    result.matched_endpoints += 1;
    const r = await enqueueDelivery(
      { endpoint_id: ep.id, organization_id, event_kind, payload },
      client,
    );
    if (r.ok) {
      result.enqueued += 1;
      result.per_endpoint.push({ endpoint_id: ep.id, delivery_id: r.delivery_id, error: null });
    } else {
      result.per_endpoint.push({ endpoint_id: ep.id, delivery_id: null, error: r.error });
    }
  }
  return result;
}
