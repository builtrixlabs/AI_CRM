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
    ]),
    ts: z.string().datetime(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type BuiltrixEvent = z.infer<typeof envelopeSchema>;

export const callAuditedPayloadSchema = z.object({
  lead_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  duration_seconds: z.number().int().nonnegative(),
  summary: z.string().optional(),
  recording_url: z.string().url().optional(),
  direction: z.enum(["inbound", "outbound"]),
});

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
