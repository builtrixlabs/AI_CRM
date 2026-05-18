import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ApiAuditInput = {
  method: string;
  path: string;
  status_code: number;
  user_id?: string | null;
  organization_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  latency_ms?: number | null;
  permission_checked?: string | null;
  rate_limit_remaining?: number | null;
};

export type ApiAuditRow = ApiAuditInput & {
  id: string;
  ts: string;
};

/**
 * Best-effort write. Caller never throws if the row fails to land — the
 * audit trail must not break the request path.
 */
export async function recordApiAudit(
  input: ApiAuditInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  try {
    await client.from("api_audit_log").insert({
      method: input.method,
      path: input.path,
      status_code: input.status_code,
      user_id: input.user_id ?? null,
      organization_id: input.organization_id ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
      latency_ms: input.latency_ms ?? null,
      permission_checked: input.permission_checked ?? null,
      rate_limit_remaining: input.rate_limit_remaining ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[api_audit_log] insert failed",
      err instanceof Error ? err.message : err
    );
  }
}

export type ListApiAuditFilters = {
  organization_id?: string | null;
  path?: string | null;
  status_min?: number | null;
  from_ts?: string | null;
  to_ts?: string | null;
};

export async function listApiAudit(
  filters: ListApiAuditFilters = {},
  limit = 200,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<ApiAuditRow[]> {
  let q = client
    .from("api_audit_log")
    .select(
      "id, ts, method, path, status_code, user_id, organization_id, ip, user_agent, latency_ms, permission_checked, rate_limit_remaining"
    );

  if (filters.organization_id) q = q.eq("organization_id", filters.organization_id);
  if (filters.path) q = q.eq("path", filters.path);
  if (typeof filters.status_min === "number") q = q.gte("status_code", filters.status_min);
  if (filters.from_ts) q = q.gte("ts", filters.from_ts);
  if (filters.to_ts) q = q.lte("ts", filters.to_ts);

  const { data, error } = await q
    .order("ts", { ascending: false })
    .limit(Math.min(limit, 1000));
  if (error || !data) return [];
  return data as ApiAuditRow[];
}
