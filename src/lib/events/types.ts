import { z } from "zod";

export const envelopeSchema = z
  .object({
    event_id: z.string().min(8),
    organization_id: z.string().uuid(),
    event_kind: z.string().min(1),
    source_product: z.enum([
      "call_audit",
      "legal_auditor",
      "mih",
      "platform",
      "voice_iq",
    ]),
    ts: z.string().datetime(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type BuiltrixEvent = z.infer<typeof envelopeSchema>;

// ── v2 sub-schemas (Voice IQ payload extension) ─────────────────────────────

export const bantSchema = z
  .object({
    budget: z.string().optional(),
    authority: z.string().optional(),
    need: z.string().optional(),
    timeline: z.string().optional(),
    score: z.number().min(0).max(100).optional(),
  })
  .strict();
export type BantPayload = z.infer<typeof bantSchema>;

export const intentSchema = z
  .object({
    intent_capture_score: z.number().min(0).max(1).optional(),
    label: z.string().optional(),
    ai_confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
export type IntentPayload = z.infer<typeof intentSchema>;

export const scoringSchema = z
  .object({
    overall: z.number().optional(),
    breakdown: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export type ScoringPayload = z.infer<typeof scoringSchema>;

export const objectionItemSchema = z
  .object({
    text: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict();
export type ObjectionItem = z.infer<typeof objectionItemSchema>;

export const complianceFlagSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]),
    note: z.string().optional(),
  })
  .strict();
export type ComplianceFlag = z.infer<typeof complianceFlagSchema>;

export const compliancePayloadSchema = z
  .object({
    flags: z.array(complianceFlagSchema).optional(),
  })
  .strict();
export type CompliancePayload = z.infer<typeof compliancePayloadSchema>;

export const nextBestActionSchema = z
  .object({
    action: z.string().min(1),
    rationale: z.string().optional(),
    ai_confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
export type NextBestAction = z.infer<typeof nextBestActionSchema>;

// ── call.audited payload (v1 + additive v2 fields) ─────────────────────────

export const callAuditedPayloadSchema = z
  .object({
    // v1 (required + optional, unchanged)
    lead_id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    duration_seconds: z.number().int().nonnegative(),
    summary: z.string().optional(),
    recording_url: z.string().url().optional(),
    direction: z.enum(["inbound", "outbound"]),
    // v2 additive — all optional
    schema_version: z.literal("v2").optional(),
    bant: bantSchema.optional(),
    intent: intentSchema.optional(),
    scoring: scoringSchema.optional(),
    competitors_mentioned: z.array(z.string().min(1)).optional(),
    objections: z.array(objectionItemSchema).optional(),
    compliance: compliancePayloadSchema.optional(),
    next_best_action: nextBestActionSchema.optional(),
  })
  .strict();

export type CallAuditedPayload = z.infer<typeof callAuditedPayloadSchema>;

export const callObjectionPayloadSchema = z.object({
  lead_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  objection: z.string().min(1),
  duration_seconds: z.number().int().nonnegative(),
  summary: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]),
});

export type CallObjectionPayload = z.infer<typeof callObjectionPayloadSchema>;

export type InboxResult =
  | {
      ok: true;
      status: "ok" | "deduped";
      deduped: boolean;
      node_id: string | null;
    }
  | { ok: false; status: "rejected" | "error"; reason: string };
