/**
 * D-442 — typed emit helpers for sister-product event kinds.
 *
 * Each helper takes (client, organization_id, payload), validates the
 * payload against its zod schema, and then fans out via emitEvent.
 * Mutation seams (lead/deal/site_visit/contact server actions, stage
 * transition RPC return paths) import these helpers instead of calling
 * emitEvent directly so the (kind, payload) contract stays in one place.
 *
 * Per-org by signature — `organization_id` is the first scoping arg.
 * No cross-tenant leakage is possible because emitEvent itself looks up
 * `webhook_endpoints` by org and the delivery worker scopes end-to-end.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, type EmitResult } from "@/lib/webhooks/emit";
import {
  PAYLOAD_SCHEMAS,
  type ContactCreatedPayload,
  type ContactUpdatedPayload,
  type DealBookedPayload,
  type DealCreatedPayload,
  type DealLostPayload,
  type DealQualifiedPayload,
  type DealStageTransitionedPayload,
  type LeadCreatedPayload,
  type LeadLostPayload,
  type LeadQualifiedPayload,
  type SisterProductEventKind,
  type SiteVisitCancelledPayload,
  type SiteVisitCompletedPayload,
  type SiteVisitScheduledPayload,
} from "./event-kinds";

async function emitTyped<K extends SisterProductEventKind>(
  client: SupabaseClient,
  organization_id: string,
  kind: K,
  payload: unknown,
): Promise<EmitResult> {
  const schema = PAYLOAD_SCHEMAS[kind];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `invalid payload for ${kind}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}:${i.message}`)
        .join("; ")}`,
    );
  }
  return emitEvent(
    organization_id,
    kind,
    parsed.data as Record<string, unknown>,
    client,
  );
}

// ─── Deal lifecycle ───────────────────────────────────────────────────

export function emitDealCreated(
  client: SupabaseClient,
  organization_id: string,
  payload: DealCreatedPayload,
) {
  return emitTyped(client, organization_id, "deal.created", payload);
}

export function emitDealQualified(
  client: SupabaseClient,
  organization_id: string,
  payload: DealQualifiedPayload,
) {
  return emitTyped(client, organization_id, "deal.qualified", payload);
}

export function emitDealBooked(
  client: SupabaseClient,
  organization_id: string,
  payload: DealBookedPayload,
) {
  return emitTyped(client, organization_id, "deal.booked", payload);
}

export function emitDealLost(
  client: SupabaseClient,
  organization_id: string,
  payload: DealLostPayload,
) {
  return emitTyped(client, organization_id, "deal.lost", payload);
}

export function emitDealStageTransitioned(
  client: SupabaseClient,
  organization_id: string,
  payload: DealStageTransitionedPayload,
) {
  return emitTyped(
    client,
    organization_id,
    "deal.stage_transitioned",
    payload,
  );
}

// ─── Lead lifecycle ───────────────────────────────────────────────────

export function emitLeadCreated(
  client: SupabaseClient,
  organization_id: string,
  payload: LeadCreatedPayload,
) {
  return emitTyped(client, organization_id, "lead.created", payload);
}

export function emitLeadQualified(
  client: SupabaseClient,
  organization_id: string,
  payload: LeadQualifiedPayload,
) {
  return emitTyped(client, organization_id, "lead.qualified", payload);
}

export function emitLeadLost(
  client: SupabaseClient,
  organization_id: string,
  payload: LeadLostPayload,
) {
  return emitTyped(client, organization_id, "lead.lost", payload);
}

// ─── Site visit lifecycle ─────────────────────────────────────────────

export function emitSiteVisitScheduled(
  client: SupabaseClient,
  organization_id: string,
  payload: SiteVisitScheduledPayload,
) {
  return emitTyped(client, organization_id, "site_visit.scheduled", payload);
}

export function emitSiteVisitCompleted(
  client: SupabaseClient,
  organization_id: string,
  payload: SiteVisitCompletedPayload,
) {
  return emitTyped(client, organization_id, "site_visit.completed", payload);
}

export function emitSiteVisitCancelled(
  client: SupabaseClient,
  organization_id: string,
  payload: SiteVisitCancelledPayload,
) {
  return emitTyped(client, organization_id, "site_visit.cancelled", payload);
}

// ─── Contact lifecycle ────────────────────────────────────────────────

export function emitContactCreated(
  client: SupabaseClient,
  organization_id: string,
  payload: ContactCreatedPayload,
) {
  return emitTyped(client, organization_id, "contact.created", payload);
}

export function emitContactUpdated(
  client: SupabaseClient,
  organization_id: string,
  payload: ContactUpdatedPayload,
) {
  return emitTyped(client, organization_id, "contact.updated", payload);
}
