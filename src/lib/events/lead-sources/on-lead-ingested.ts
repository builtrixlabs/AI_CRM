/**
 * D-443 — handler for `lead.ingested` events from the separate
 * lead-sources app (Meta Lead Ads / Google / JustDial / Sulekha /
 * MagicBricks / 99acres / Housing.com fan-out lives in that app, not
 * here).
 *
 * Scaffolding tier: validates payload + records the event. Triggering
 * Lead Enrichment Agent on this event reuses D-417's enrichment hook
 * and lands when D-417's dispatcher is extended (out of scope for D-443).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  leadIngestedPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";

export async function onLeadIngested(
  envelope: BuiltrixEvent,
  _deps: { client: SupabaseClient },
): Promise<InboxResult> {
  const parsed = leadIngestedPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: `invalid payload: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}:${i.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, status: "ok", deduped: false, node_id: null };
}
