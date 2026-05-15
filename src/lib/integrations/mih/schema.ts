// D-604 (V6 Phase 1) — Marketing Intelligence Hub inbound request schema.
// Implements docs/baselines/122-mih-inbound-contract.md §2 verbatim.
//
// Both objects are `.passthrough()` (not `.strict()`): baseline 122 §10
// classifies "new optional request fields" as additive (no version bump),
// so unknown keys must not 400 — they are simply ignored (the full body is
// archived in `raw_payload` regardless).

import { z } from "zod";

export const MIH_SOURCE_CHANNELS = [
  "paid_social",
  "paid_search",
  "aggregator",
  "organic_web",
  "walk_in",
  "cp",
] as const;
export type MihSourceChannel = (typeof MIH_SOURCE_CHANNELS)[number];

export const mihPreferenceSchema = z
  .object({
    bhk: z.number().int().positive().optional(),
    budget_band: z.string().max(120).optional(),
    project_interest: z.string().max(200).optional(),
    area_sqft_min: z.number().nonnegative().optional(),
    area_sqft_max: z.number().nonnegative().optional(),
    city: z.string().max(120).optional(),
    locality: z.string().max(160).optional(),
  })
  .passthrough();

export const mihLeadInboundSchema = z
  .object({
    organization_id: z.string().uuid(),
    external_id: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    phone_e164: z.string().min(7).max(20),
    email: z.string().email().max(200).optional(),
    source: z.string().min(1).max(120),
    source_campaign_id: z.string().max(200).optional(),
    source_ad_id: z.string().max(200).optional(),
    source_channel: z.enum(MIH_SOURCE_CHANNELS),
    source_received_at: z.string().datetime(),
    preference: mihPreferenceSchema,
    age: z.number().int().positive().max(150).optional(),
    gender: z.string().max(40).optional(),
    occupation: z.string().max(120).optional(),
    notes: z.string().max(4000).optional(),
    raw_payload: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type MihLeadInbound = z.infer<typeof mihLeadInboundSchema>;
