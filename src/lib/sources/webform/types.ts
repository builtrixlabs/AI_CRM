import { z } from "zod";

export const SOURCE_CHANNELS = [
  "paid_social",
  "paid_search",
  "aggregator",
  "organic_web",
  "walk_in",
  "cp",
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

// Payload schema accepted by /api/leads/ingest/[token]. Required: phone.
// Optional: provenance metadata + buyer info. Unknown keys preserved in
// data.source_payload (the raw JSON).
export const webformIngestPayloadSchema = z
  .object({
    phone: z.string().min(7).max(40),
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().max(160).optional(),
    interest: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    source_campaign_id: z.string().max(120).optional(),
    source_adset_id: z.string().max(120).optional(),
    source_ad_id: z.string().max(120).optional(),
    source_channel: z.enum(SOURCE_CHANNELS).optional(),
  })
  .passthrough();
export type WebformIngestPayload = z.infer<typeof webformIngestPayloadSchema>;

export type WebformEndpointRow = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  label: string;
  token_prefix: string;
  is_active: boolean;
  last_received_at: string | null;
  received_count: number;
  created_at: string;
};

export type IngestOk = {
  ok: true;
  lead_id: string;
  endpoint_id: string;
};
export type IngestQuarantined = {
  ok: false;
  reason: "quarantined";
  quarantine_id: string;
  endpoint_id: string;
};
export type IngestError = {
  ok: false;
  reason: "invalid_token" | "internal";
  message?: string;
};
export type IngestResult = IngestOk | IngestQuarantined | IngestError;

export class WebformSourceError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid_token" | "internal" | "validation",
  ) {
    super(message);
    this.name = "WebformSourceError";
  }
}
