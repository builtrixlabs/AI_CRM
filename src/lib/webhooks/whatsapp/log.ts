import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { IngestStatus } from "./types";

export type IngestLogInput = {
  organization_id: string | null;
  workspace_id: string | null;
  wa_message_id: string;
  from_phone_e164: string | null;
  status: IngestStatus;
  reason?: string | null;
  activity_id?: string | null;
  lead_id?: string | null;
};

/**
 * Append one row to `whatsapp_inbound_log`. Best-effort: failure to
 * log is reported via console.warn but never blocks ingestion (the
 * activity row is the source of truth; the log is operator-replay).
 */
export async function recordIngestion(
  input: IngestLogInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const { error } = await client.from("whatsapp_inbound_log").insert({
    organization_id: input.organization_id,
    workspace_id: input.workspace_id,
    wa_message_id: input.wa_message_id,
    from_phone_e164: input.from_phone_e164,
    status: input.status,
    reason: input.reason ?? null,
    activity_id: input.activity_id ?? null,
    lead_id: input.lead_id ?? null,
  });
  if (error) {
    console.warn(
      "[whatsapp_inbound_log] insert failed",
      error.message,
      input.wa_message_id
    );
  }
}
