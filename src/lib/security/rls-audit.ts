import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * D-302 — programmatic RLS-leak probe.
 *
 * The audit suite exercises this module against a real Supabase project; the
 * unit tests exercise it against a mock client. Both layers see the same
 * primitives so the integration runner is a thin describe.it loop.
 */

export type TenantTable = {
  table_name: string;
  has_organization_id: boolean;
  has_workspace_id: boolean;
};

/**
 * Tables we deliberately exclude from the cross-org probe.
 *
 * - Tables intended to be readable by all authenticated users (platform
 *   defaults seeded with `organization_id IS NULL`, e.g. `directives`,
 *   `platform_flags`).
 * - Tables that *don't* carry tenant data (e.g. `subscription_plans` is
 *   per-tier reference, `webhook_endpoints` is per-org but its FK gives
 *   it a different shape — pinpoint test covers it).
 *
 * The audit harness will warn (not fail) if a table is in this list but
 * doesn't actually have an organization_id column — keeps the list honest
 * as schemas evolve.
 */
export const RLS_AUDIT_EXCLUDE_TABLES: ReadonlySet<string> = new Set([
  // Intentionally cross-tenant readable:
  "directives", // platform-default rows have organization_id IS NULL
  "platform_flags", // global flags
  "subscription_plans", // tier reference (no tenant ownership)
  // Audit-log: append-only by trigger; super_admin reads cross-org by design.
  "audit_log",
  // System tables that don't carry tenant data:
  "embedding_queue", // queue items reference nodes (which carry tenant);
  // probing is via the parent table.
]);

/**
 * Tables that get an explicit, named pinpoint test — these are the surfaces
 * a leak would matter most on (per the D-302 spec). Order matters: failures
 * here are surfaced first.
 */
export const RLS_AUDIT_PINPOINT_TABLES: readonly string[] = [
  "nodes",
  "edges",
  "node_signals",
  "api_audit_log",
  "org_integration_secrets",
] as const;

/**
 * Fetch every public table that carries `organization_id`, via
 * information_schema. Returns the table list sorted alphabetically.
 */
export async function enumerateTenantTables(
  client: SupabaseClient
): Promise<TenantTable[]> {
  const { data, error } = await client
    .schema("information_schema")
    .from("columns")
    .select("table_name, column_name")
    .eq("table_schema", "public")
    .in("column_name", ["organization_id", "workspace_id"]);

  if (error || !data) return [];

  const byTable = new Map<string, { org: boolean; ws: boolean }>();
  for (const row of data as { table_name: string; column_name: string }[]) {
    if (RLS_AUDIT_EXCLUDE_TABLES.has(row.table_name)) continue;
    const cur = byTable.get(row.table_name) ?? { org: false, ws: false };
    if (row.column_name === "organization_id") cur.org = true;
    if (row.column_name === "workspace_id") cur.ws = true;
    byTable.set(row.table_name, cur);
  }

  return Array.from(byTable.entries())
    .filter(([, v]) => v.org)
    .map(([name, v]) => ({
      table_name: name,
      has_organization_id: v.org,
      has_workspace_id: v.ws,
    }))
    .sort((a, b) => a.table_name.localeCompare(b.table_name));
}

export type ProbeResult =
  | { ok: true; rows_visible: 0 }
  | { ok: false; reason: "leak"; rows_visible: number; sample?: unknown }
  | { ok: false; reason: "error"; message: string };

/**
 * Run a SELECT *as the caller* against rows owned by a *different* org.
 * Pass: 0 rows visible (RLS denies). Fail: any rows returned.
 *
 * `client` MUST be authenticated as a regular user from the *probing* org —
 * not a service-role client, not the target org's user.
 */
export async function probeCrossOrgRead(
  client: SupabaseClient,
  table: string,
  target_org_id: string
): Promise<ProbeResult> {
  const { data, error } = await client
    .from(table)
    .select("organization_id")
    .eq("organization_id", target_org_id)
    .limit(5);

  if (error) {
    if (rlsErrorIsExpectedDenial(error)) {
      return { ok: true, rows_visible: 0 };
    }
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "unknown",
    };
  }

  if (!data || data.length === 0) return { ok: true, rows_visible: 0 };
  return {
    ok: false,
    reason: "leak",
    rows_visible: data.length,
    sample: data[0],
  };
}

/**
 * Attempt INSERT-as-userA with `organization_id = orgB`. Pass: RLS rejects
 * the write. Fail: insert succeeds (would be a tenant-isolation breach).
 */
export async function probeCrossOrgInsert(
  client: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  target_org_id: string
): Promise<ProbeResult> {
  const row = { ...payload, organization_id: target_org_id };
  const { data, error } = await client.from(table).insert(row).select("*");

  if (error) {
    if (rlsErrorIsExpectedDenial(error)) {
      return { ok: true, rows_visible: 0 };
    }
    return {
      ok: false,
      reason: "error",
      message: error.message ?? "unknown",
    };
  }

  return {
    ok: false,
    reason: "leak",
    rows_visible: Array.isArray(data) ? data.length : 1,
    sample: data,
  };
}

/**
 * Distinguish "RLS denied this write" (expected) from "the column doesn't
 * exist / FK violation / NOT NULL violation" (test-payload bug).
 */
export function rlsErrorIsExpectedDenial(error: {
  code?: string;
  message?: string;
}): boolean {
  if (!error) return false;
  if (error.code === "42501") return true; // insufficient_privilege
  if (error.code === "PGRST301") return true; // postgrest RLS denial
  if ((error.message ?? "").toLowerCase().includes("row-level security")) {
    return true;
  }
  if ((error.message ?? "").toLowerCase().includes("violates row-level")) {
    return true;
  }
  return false;
}
