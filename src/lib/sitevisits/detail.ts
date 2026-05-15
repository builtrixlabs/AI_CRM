// D-602 (V6 Phase 1) — site-visit detail fetch for /dashboard/site-visits/[id].
//
// Site visits are `nodes` rows (baseline/110 §I). This resolves one visit
// + its lead label + its activity history (audit_log rows for the node).
// Org-scoped on every read — the service-role client bypasses RLS, so the
// organization_id filter is the load-bearing tenant guard.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SiteVisitState } from "./transitions";

export type SiteVisitHistoryEntry = {
  ts: string;
  action: string;
  actor_id: string;
  actor_role: string;
  diff: Record<string, unknown> | null;
};

export type SiteVisitDetail = {
  id: string;
  state: SiteVisitState | null;
  data: Record<string, unknown>;
  created_at: string;
  created_by: string;
  updated_at: string;
  lead_id: string | null;
  lead_label: string | null;
  history: SiteVisitHistoryEntry[];
};

export async function getSiteVisitDetail(
  id: string,
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<SiteVisitDetail | null> {
  const { data: row, error } = await client
    .from("nodes")
    .select("id, state, data, created_at, created_by, updated_at")
    .eq("id", id)
    .eq("node_type", "site_visit")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) return null;

  const node = row as {
    id: string;
    state: string | null;
    data: Record<string, unknown> | null;
    created_at: string;
    created_by: string;
    updated_at: string;
  };
  const data = node.data ?? {};
  const lead_id = typeof data.lead_id === "string" ? data.lead_id : null;

  let lead_label: string | null = null;
  if (lead_id) {
    const { data: lead } = await client
      .from("nodes")
      .select("label")
      .eq("id", lead_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    lead_label = (lead as { label: string } | null)?.label ?? null;
  }

  const { data: auditRows } = await client
    .from("audit_log")
    .select("ts, action, actor_id, actor_role, diff")
    .eq("table_name", "nodes")
    .eq("record_id", id)
    .eq("organization_id", organization_id)
    .order("ts", { ascending: false });

  const history: SiteVisitHistoryEntry[] = (
    (auditRows ?? []) as SiteVisitHistoryEntry[]
  ).map((r) => ({
    ts: r.ts,
    action: r.action,
    actor_id: r.actor_id,
    actor_role: r.actor_role,
    diff: r.diff ?? null,
  }));

  return {
    id: node.id,
    state: (node.state as SiteVisitState | null) ?? null,
    data,
    created_at: node.created_at,
    created_by: node.created_by,
    updated_at: node.updated_at,
    lead_id,
    lead_label,
    history,
  };
}
