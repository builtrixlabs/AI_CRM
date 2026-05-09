import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type DeliveryLogRow = {
  id: string;
  ts: string;
  event_id: string;
  event_kind: string;
  status: "ok" | "deduped" | "rejected" | "error";
  reason: string | null;
  resulting_node_id: string | null;
};

/**
 * Read the last `limit` Voice IQ delivery rows for an org. Service-role
 * client because event_inbox_log RLS allows org-admin reads but the
 * admin page is rendered server-side and we already gate on permission.
 */
export async function listVoiceIqDeliveries(
  organization_id: string,
  limit = 50,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<DeliveryLogRow[]> {
  const { data, error } = await client
    .from("event_inbox_log")
    .select("id, ts, event_id, event_kind, status, reason, resulting_node_id")
    .eq("organization_id", organization_id)
    .eq("source_product", "voice_iq")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as DeliveryLogRow[];
}
