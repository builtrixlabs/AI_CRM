/**
 * Types for the WhatsApp inbound webhook (D-010).
 *
 * The `WhatsAppInboundPayload` shape is the *normalized* one; provider
 * envelopes are flattened in the route before dispatch. Adapter for
 * the official WhatsApp Cloud API arrives in V1; for V0 we accept
 * the flat shape directly.
 */

export type WhatsAppInboundPayload = {
  /** Provider-supplied message id; the dedup key. */
  wa_message_id: string;
  /** E.164-ish from-phone (string; the helper normalizes). */
  from_phone: string;
  /** E.164-ish to-phone (the org's WhatsApp number). */
  to_phone: string;
  /** Message text body. May be empty for media-only messages. */
  body: string;
  /** Provider-supplied timestamp (ISO 8601). */
  ts: string;
  /** Optional raw provider envelope (kept for replay). */
  raw?: Record<string, unknown>;
};

export type IngestStatus =
  | "ok"
  | "deduped"
  | "orphan"
  | "rejected"
  | "error";

export type IngestResult =
  | {
      ok: true;
      status: "ok" | "deduped" | "orphan";
      activity_id: string | null;
      lead_id: string | null;
      deduped: boolean;
    }
  | {
      ok: false;
      status: "rejected" | "error";
      reason: string;
    };

export class WhatsAppIngestError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "WhatsAppIngestError";
  }
}
