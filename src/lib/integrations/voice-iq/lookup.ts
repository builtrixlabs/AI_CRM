import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhoneE164 } from "../phone";

export type LookupQuery = {
  organization_id: string;
  external_id?: string | null;
  phone?: string | null;
};

export type LookupResult = {
  lead_node_id: string;
  workspace_id: string;
} | null;

/**
 * Find a lead in `organization_id` by `external_id` (preferred) or `phone`
 * (E.164-normalized, exact match). Returns null when nothing matches or
 * when neither key is present.
 *
 * Read-only; the caller (route layer) writes the audit row.
 */
export async function lookupLead(
  query: LookupQuery,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<LookupResult> {
  if (query.external_id) {
    const { data, error } = await client
      .from("nodes")
      .select("id, workspace_id")
      .eq("organization_id", query.organization_id)
      .eq("node_type", "lead")
      .is("deleted_at", null)
      .eq("data->custom->>external_id", query.external_id)
      .limit(1);
    if (!error && data && data.length > 0) {
      const row = data[0] as { id: string; workspace_id: string };
      return { lead_node_id: row.id, workspace_id: row.workspace_id };
    }
  }

  if (query.phone) {
    const e164 = normalizePhoneE164(query.phone);
    if (!e164) return null;
    const { data, error } = await client
      .from("nodes")
      .select("id, workspace_id, data")
      .eq("organization_id", query.organization_id)
      .eq("node_type", "lead")
      .is("deleted_at", null)
      .limit(50);
    if (!error && data) {
      // Phone is stored as the operator entered it. Re-normalize on read
      // to match across "+91 98xx" vs "098xx" vs "98xx" forms.
      for (const r of data as Array<{
        id: string;
        workspace_id: string;
        data: { phone?: string };
      }>) {
        const stored = r.data?.phone;
        if (!stored) continue;
        if (normalizePhoneE164(stored) === e164) {
          return { lead_node_id: r.id, workspace_id: r.workspace_id };
        }
      }
    }
  }

  return null;
}

/**
 * Resolve which org owns the given Bearer secret. Matches against
 * org_integration_secrets (per-org Voice IQ secret) first; falls back
 * to platform default. Returns the matching organization_id or null.
 *
 * Constant-time compare done in the route layer using node:crypto's
 * timingSafeEqual; this helper just enumerates candidate orgs.
 */
export async function findOrgByVoiceIqSecret(
  candidate: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<string | null> {
  if (!candidate || candidate.length < 8) return null;
  // O(n) over orgs with a configured secret — fine for v2 demo scale.
  // Indexed by `voice_iq_inbox_secret` kind so the read is bounded.
  const { data, error } = await client
    .from("org_integration_secrets")
    .select("organization_id, value")
    .eq("kind", "voice_iq_inbox_secret");
  if (error || !data) return null;
  for (const r of data as Array<{ organization_id: string; value: string }>) {
    if (constantTimeStringEq(r.value, candidate)) {
      return r.organization_id;
    }
  }
  return null;
}

function constantTimeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
