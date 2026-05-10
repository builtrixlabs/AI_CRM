/**
 * V3.x — GDPR Art 17 hard-delete helper.
 *
 * Wraps the `hard_delete_organization(uuid, uuid, text)` SECURITY DEFINER
 * RPC. The RPC verifies caller is super_admin (JWT claim) AND requires a
 * non-trivial reason string. Returns row-count summary on success or
 * surfaces the RPC error verbatim on failure.
 *
 * Caller path: super_admin only, via /platform/organizations/<id>/erase
 * (UI not in this commit). Operator can invoke directly from a privileged
 * server context as well.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type HardDeleteResult =
  | { ok: true; organization_id: string; reason: string; counts: Record<string, number> }
  | { ok: false; error: string };

export async function hardDeleteOrganization(
  organization_id: string,
  actor_id: string,
  reason: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<HardDeleteResult> {
  if (!organization_id) return { ok: false, error: "organization_id_required" };
  if (!actor_id) return { ok: false, error: "actor_id_required" };
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 5) return { ok: false, error: "reason_required_min_5_chars" };

  const { data, error } = await client.rpc("hard_delete_organization", {
    p_org_id: organization_id,
    p_actor_id: actor_id,
    p_reason: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  const row = data as { organization_id?: string; reason?: string; counts?: Record<string, number> } | null;
  if (!row) return { ok: false, error: "no_rpc_payload" };
  return {
    ok: true,
    organization_id: row.organization_id ?? organization_id,
    reason: row.reason ?? trimmed,
    counts: row.counts ?? {},
  };
}
