/**
 * D-443 — handler for `post_sales.milestone_updated` events from PSCRM.
 *
 * Scaffolding tier: validates the payload and records the event. Full
 * activity-stream wiring (writing the milestone tick into the deal's
 * activity_stream) lands in a follow-up dispatcher directive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  postSalesMilestoneUpdatedPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";

export async function onPostSalesMilestoneUpdated(
  envelope: BuiltrixEvent,
  _deps: { client: SupabaseClient },
): Promise<InboxResult> {
  const parsed = postSalesMilestoneUpdatedPayloadSchema.safeParse(
    envelope.payload,
  );
  if (!parsed.success) {
    return {
      ok: false,
      status: "rejected",
      reason: `invalid payload: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}:${i.message}`)
        .join("; ")}`,
    };
  }
  // event_inbox_log records the ingestion (handled by the dispatcher).
  // No node_id because milestones aren't surfaced as nodes yet.
  return { ok: true, status: "ok", deduped: false, node_id: null };
}
