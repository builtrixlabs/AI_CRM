/**
 * D-443 — handler for `post_sales.handover_completed` events from PSCRM.
 *
 * Scaffolding tier: validates the payload and records the event.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  postSalesHandoverCompletedPayloadSchema,
  type BuiltrixEvent,
  type InboxResult,
} from "../types";

export async function onPostSalesHandoverCompleted(
  envelope: BuiltrixEvent,
  _deps: { client: SupabaseClient },
): Promise<InboxResult> {
  const parsed = postSalesHandoverCompletedPayloadSchema.safeParse(
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
  return { ok: true, status: "ok", deduped: false, node_id: null };
}
