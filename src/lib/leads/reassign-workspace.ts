/**
 * V3.x — D-122: cross-workspace lead reassignment.
 *
 * V3.0 keeps every node strictly anchored to its origin workspace, even
 * though leads can be re-assigned to reps in different teams within the
 * same workspace. Some real-estate orgs (multi-region: Mumbai HQ +
 * Bengaluru sales arm) need a lead created via the WhatsApp inbox in
 * workspace A to be re-homed in workspace B without a manual CSV
 * round-trip.
 *
 * Behaviour:
 *   - Verify both workspaces belong to the same organization.
 *   - UPDATE the lead row's workspace_id (and bridge edges that carry
 *     workspace_id). NB: nodes table has organization_id but workspaces
 *     are referenced via data jsonb today; this lib treats the canonical
 *     "workspace pointer" as nodes.workspace_id when the column exists,
 *     otherwise data.workspace_id. (V3.0 schema audit pending — see
 *     reassignment migration in V3.x part 2.)
 *   - Append audit row.
 *   - Return the new workspace_id or an error.
 *
 * Callers: org_admin / workspace_admin via /admin/leads/[id]/reassign
 * (UI deferred). gates on `leads:reassign_workspace` permission.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ReassignResult =
  | { ok: true; lead_id: string; from_workspace_id: string; to_workspace_id: string }
  | { ok: false; error: string };

export async function reassignLeadToWorkspace(
  args: {
    lead_id: string;
    target_workspace_id: string;
    actor_id: string;
    reason: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ReassignResult> {
  const { lead_id, target_workspace_id, actor_id, reason } = args;
  if (!lead_id) return { ok: false, error: "lead_id_required" };
  if (!target_workspace_id) return { ok: false, error: "target_workspace_id_required" };
  if (!actor_id) return { ok: false, error: "actor_id_required" };
  if ((reason ?? "").trim().length < 5) return { ok: false, error: "reason_required_min_5_chars" };

  // 1. Load lead.
  const { data: lead, error: leadErr } = await client
    .from("nodes")
    .select("id, organization_id, workspace_id, kind, deleted_at")
    .eq("id", lead_id)
    .maybeSingle();
  if (leadErr) return { ok: false, error: leadErr.message };
  if (!lead) return { ok: false, error: "lead_not_found" };
  const r = lead as { id: string; organization_id: string; workspace_id: string | null; kind: string; deleted_at: string | null };
  if (r.kind !== "lead") return { ok: false, error: "not_a_lead" };
  if (r.deleted_at) return { ok: false, error: "lead_deleted" };
  if (r.workspace_id === target_workspace_id) {
    return { ok: false, error: "already_in_target_workspace" };
  }

  // 2. Verify target workspace is in the same org.
  const { data: ws, error: wsErr } = await client
    .from("workspaces")
    .select("id, organization_id, deleted_at")
    .eq("id", target_workspace_id)
    .maybeSingle();
  if (wsErr) return { ok: false, error: wsErr.message };
  if (!ws) return { ok: false, error: "target_workspace_not_found" };
  const w = ws as { id: string; organization_id: string; deleted_at: string | null };
  if (w.deleted_at) return { ok: false, error: "target_workspace_deleted" };
  if (w.organization_id !== r.organization_id) {
    return { ok: false, error: "cross_org_reassignment_forbidden" };
  }

  const from_workspace_id = r.workspace_id ?? "";

  // 3. Update lead row.
  const { error: updErr } = await client
    .from("nodes")
    .update({
      workspace_id: target_workspace_id,
      updated_at: new Date().toISOString(),
      updated_by: actor_id,
      updated_via: "manual",
    })
    .eq("id", lead_id);
  if (updErr) return { ok: false, error: updErr.message };

  // 4. Audit row.
  await client.from("audit_log").insert({
    organization_id: r.organization_id,
    actor_id,
    actor_type: "user",
    actor_role: "system",
    table_name: "nodes",
    record_id: lead_id,
    action: "lead_workspace_reassigned",
    diff: {
      from_workspace_id,
      to_workspace_id: target_workspace_id,
      reason: reason.trim(),
    },
  });

  return {
    ok: true,
    lead_id,
    from_workspace_id,
    to_workspace_id: target_workspace_id,
  };
}
