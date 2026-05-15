/**
 * v6.2.1 — can this user approve this queue row?
 *
 * Three paths to true (most permissive first):
 *   1. Holds agents:approve_T2 (workspace_admin+) — passes for any draft in
 *      their org.
 *   2. Holds agents:view_activity (manager / org_admin / org_owner) — passes
 *      for any draft in their org. This is the perm the admin queue route
 *      already gates on.
 *   3. Holds agents:approve_own_leads AND owns the lead the draft is for.
 *      Owner = nodes.data.assigned_sales_rep_id (jsonb), the slot D-610
 *      writes when the allocation engine assigns a rep. This path is the
 *      v6.2.1 inline-approval surface for sales / phone reps.
 *
 * Cross-tenant defense: a queue row's organization_id MUST match user.org_id
 * before any other check runs. Caller is expected to have already loaded the
 * queue row with `.eq("organization_id", user.org_id)`, but we re-verify
 * here as belt-and-suspenders.
 *
 * This helper lives outside src/lib/auth/permissions.ts on purpose:
 * permissions.ts is pure-functional (no I/O), and we want to keep it that
 * way so it can be exercised from any execution context without dragging
 * the supabase service-role client into the import graph.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveForUser } from "./permissions";
import type { CurrentUser } from "./types";

export type QueueRowOwnership = {
  lead_id: string;
  organization_id: string;
};

export async function canApproveQueueItem(
  user: CurrentUser,
  queue_row: QueueRowOwnership,
  client?: SupabaseClient,
): Promise<boolean> {
  if (!user.org_id || user.org_id !== queue_row.organization_id) {
    return false;
  }

  const perms = resolveForUser(user);
  if (perms.has("agents:approve_T2")) return true;
  if (perms.has("agents:view_activity")) return true;
  if (!perms.has("agents:approve_own_leads")) return false;

  const supabase = client ?? getSupabaseAdmin();
  const { data } = await supabase
    .from("nodes")
    .select("data")
    .eq("id", queue_row.lead_id)
    .eq("organization_id", queue_row.organization_id)
    .eq("node_type", "lead")
    .maybeSingle();

  const leadData = (data as { data: Record<string, unknown> | null } | null)
    ?.data;
  const assignedId = leadData?.assigned_sales_rep_id;
  return typeof assignedId === "string" && assignedId === user.user.id;
}
