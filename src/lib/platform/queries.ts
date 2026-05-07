import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AuditFilters,
  AuditRow,
  OrgAdminRow,
  OrgDetail,
  OrgRow,
  PlatformCounts,
  SubscriptionSummary,
} from "./types";

/**
 * Read-side helpers used by /platform/* pages. All use the service-role
 * client (RLS would block authenticated super_admin reads on operational
 * tables — by design). Each call that returns identifiable per-org data
 * writes one `audit_log` row with action='read_sensitive' per
 * Constitution VII, EXCEPT pure aggregate counts (no per-row exposure).
 */

async function logSensitiveRead(
  client: SupabaseClient,
  actor_id: string,
  organization_id: string | null,
  kind: string,
  record_id: string | null = null
) {
  await client.from("audit_log").insert({
    actor_id,
    actor_type: "user",
    actor_role: "super_admin",
    organization_id,
    table_name: "platform_read",
    record_id,
    action: "read_sensitive",
    diff: { kind },
  });
}

export async function platformCounts(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PlatformCounts> {
  const orgs = await client
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const active = await client
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const admins = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("base_role", "org_admin")
    .is("deleted_at", null);
  return {
    total_orgs: orgs.count ?? 0,
    active_orgs: active.count ?? 0,
    org_admins: admins.count ?? 0,
  };
}

export async function listOrgs(
  filters: { search?: string; limit?: number; offset?: number } = {},
  actor_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<OrgRow[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  let q = client
    .from("organizations")
    .select(
      "id, slug, name, plan_tier, rera_number, gstin, primary_contact_email, created_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.search && filters.search.length > 0) {
    const s = filters.search.replace(/[%_]/g, "");
    q = q.or(`name.ilike.%${s}%,slug.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  await logSensitiveRead(client, actor_id, null, "list_orgs");
  return (data ?? []) as OrgRow[];
}

export async function getOrgDetail(
  id: string,
  actor_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<OrgDetail | null> {
  const orgQ = await client
    .from("organizations")
    .select(
      "id, slug, name, plan_tier, rera_number, gstin, primary_contact_email, created_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (orgQ.error) throw orgQ.error;
  if (!orgQ.data) return null;

  const adminsQ = await client
    .from("profiles")
    .select("id, email, display_name, base_role, created_at")
    .eq("organization_id", id)
    .in("base_role", ["org_owner", "org_admin"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (adminsQ.error) throw adminsQ.error;

  const subQ = await client
    .from("subscriptions")
    .select("plan_tier, status, starts_at, current_period_end")
    .eq("organization_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (subQ.error) throw subQ.error;

  const auditQ = await client
    .from("audit_log")
    .select(
      "id, ts, actor_id, actor_role, action, table_name, record_id, organization_id"
    )
    .eq("organization_id", id)
    .order("ts", { ascending: false })
    .limit(50);
  if (auditQ.error) throw auditQ.error;

  await logSensitiveRead(client, actor_id, id, "org_detail", id);

  return {
    ...(orgQ.data as OrgRow),
    admins: (adminsQ.data ?? []) as OrgAdminRow[],
    subscription: (subQ.data ?? null) as SubscriptionSummary | null,
    recent_audit: (auditQ.data ?? []) as AuditRow[],
  };
}

export async function recentAuditRows(
  filters: AuditFilters,
  limit: number,
  actor_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<AuditRow[]> {
  let q = client
    .from("audit_log")
    .select(
      "id, ts, actor_id, actor_role, action, table_name, record_id, organization_id"
    )
    .order("ts", { ascending: false })
    .limit(Math.min(limit, 1000));

  if (filters.organization_id) q = q.eq("organization_id", filters.organization_id);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.from_ts) q = q.gte("ts", filters.from_ts);
  if (filters.to_ts) q = q.lte("ts", filters.to_ts);

  const { data, error } = await q;
  if (error) throw error;

  await logSensitiveRead(
    client,
    actor_id,
    filters.organization_id ?? null,
    "platform_audit",
    null
  );
  return (data ?? []) as AuditRow[];
}
