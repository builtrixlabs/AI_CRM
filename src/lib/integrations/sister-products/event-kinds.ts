/**
 * D-442 — canonical event kinds emitted to sister products.
 *
 * Single source of truth for which event kinds sister products can
 * subscribe to, and the zod payload schema for each.
 * Every emit helper in `./emit-helpers.ts` validates against one of
 * these schemas before fanning out via `emitEvent`.
 *
 * Adding a new kind:
 *   1. Append the literal to SISTER_PRODUCT_EVENT_KINDS.
 *   2. Add a `${kind}Schema` zod entry.
 *   3. Register `${kind}Schema` in PAYLOAD_SCHEMAS.
 *   4. Add a typed helper in `./emit-helpers.ts`.
 *   5. Document the contract on `docs/api/sister-product-api-v1.md` (D-441).
 */

import { z } from "zod";

export const SISTER_PRODUCT_EVENT_KINDS = [
  // Deal lifecycle
  "deal.created",
  "deal.qualified",
  "deal.booked",
  "deal.lost",
  "deal.stage_transitioned",
  // Lead lifecycle
  "lead.created",
  "lead.qualified",
  "lead.lost",
  // Site-visit lifecycle
  "site_visit.scheduled",
  "site_visit.completed",
  "site_visit.cancelled",
  // Contact
  "contact.created",
  "contact.updated",
] as const;

export type SisterProductEventKind =
  (typeof SISTER_PRODUCT_EVENT_KINDS)[number];

export function isSisterProductEventKind(
  kind: string,
): kind is SisterProductEventKind {
  return (SISTER_PRODUCT_EVENT_KINDS as readonly string[]).includes(kind);
}

// ─── Shared atoms ─────────────────────────────────────────────────────

const uuid = z.string().uuid();
const isoDatetime = z.string().datetime();

// ─── Deal lifecycle ───────────────────────────────────────────────────

export const dealCreatedSchema = z
  .object({
    deal_id: uuid,
    contact_id: uuid.optional(),
    source: z.string().optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type DealCreatedPayload = z.infer<typeof dealCreatedSchema>;

export const dealQualifiedSchema = z
  .object({
    deal_id: uuid,
    qualified_by: uuid.optional(),
    bant_score: z.number().min(0).max(100).optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type DealQualifiedPayload = z.infer<typeof dealQualifiedSchema>;

export const dealBookedSchema = z
  .object({
    deal_id: uuid,
    unit_id: uuid.optional(),
    booking_amount_inr: z.number().nonnegative().optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type DealBookedPayload = z.infer<typeof dealBookedSchema>;

export const dealLostSchema = z
  .object({
    deal_id: uuid,
    reason: z.string().min(1).optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type DealLostPayload = z.infer<typeof dealLostSchema>;

export const dealStageTransitionedSchema = z
  .object({
    deal_id: uuid,
    from_stage: z.string().min(1),
    to_stage: z.string().min(1),
    transitioned_by: uuid.optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type DealStageTransitionedPayload = z.infer<
  typeof dealStageTransitionedSchema
>;

// ─── Lead lifecycle ───────────────────────────────────────────────────

export const leadCreatedSchema = z
  .object({
    lead_id: uuid,
    source: z.string().optional(),
    workspace_id: uuid.optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type LeadCreatedPayload = z.infer<typeof leadCreatedSchema>;

export const leadQualifiedSchema = z
  .object({
    lead_id: uuid,
    qualified_by: uuid.optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type LeadQualifiedPayload = z.infer<typeof leadQualifiedSchema>;

export const leadLostSchema = z
  .object({
    lead_id: uuid,
    reason: z.string().min(1).optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type LeadLostPayload = z.infer<typeof leadLostSchema>;

// ─── Site visit lifecycle ─────────────────────────────────────────────

export const siteVisitScheduledSchema = z
  .object({
    site_visit_id: uuid,
    lead_id: uuid.optional(),
    deal_id: uuid.optional(),
    scheduled_at: isoDatetime,
    occurred_at: isoDatetime,
  })
  .strict();
export type SiteVisitScheduledPayload = z.infer<
  typeof siteVisitScheduledSchema
>;

export const siteVisitCompletedSchema = z
  .object({
    site_visit_id: uuid,
    lead_id: uuid.optional(),
    deal_id: uuid.optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type SiteVisitCompletedPayload = z.infer<
  typeof siteVisitCompletedSchema
>;

export const siteVisitCancelledSchema = z
  .object({
    site_visit_id: uuid,
    reason: z.string().min(1).optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type SiteVisitCancelledPayload = z.infer<
  typeof siteVisitCancelledSchema
>;

// ─── Contact lifecycle ────────────────────────────────────────────────

export const contactCreatedSchema = z
  .object({
    contact_id: uuid,
    primary_phone: z.string().optional(),
    primary_email: z.string().email().optional(),
    occurred_at: isoDatetime,
  })
  .strict();
export type ContactCreatedPayload = z.infer<typeof contactCreatedSchema>;

export const contactUpdatedSchema = z
  .object({
    contact_id: uuid,
    changed_fields: z.array(z.string().min(1)).min(1),
    occurred_at: isoDatetime,
  })
  .strict();
export type ContactUpdatedPayload = z.infer<typeof contactUpdatedSchema>;

// ─── Schema registry (kind → schema) ──────────────────────────────────

export const PAYLOAD_SCHEMAS = {
  "deal.created": dealCreatedSchema,
  "deal.qualified": dealQualifiedSchema,
  "deal.booked": dealBookedSchema,
  "deal.lost": dealLostSchema,
  "deal.stage_transitioned": dealStageTransitionedSchema,
  "lead.created": leadCreatedSchema,
  "lead.qualified": leadQualifiedSchema,
  "lead.lost": leadLostSchema,
  "site_visit.scheduled": siteVisitScheduledSchema,
  "site_visit.completed": siteVisitCompletedSchema,
  "site_visit.cancelled": siteVisitCancelledSchema,
  "contact.created": contactCreatedSchema,
  "contact.updated": contactUpdatedSchema,
} as const;
