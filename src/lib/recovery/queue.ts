/**
 * D-616 — Customer Recovery queue list + claim + resolve.
 *
 * All three operations run on `getSupabaseAdmin()` and filter by
 * `organization_id` (caller-org filter — Constitution II). The
 * recovery:* permissions are gated at the page + server-action layer.
 *
 * Lead labels are batch-fetched in a second query (not a PostgREST
 * embedded join) — the codebase's listSiteVisits / listProjects pattern.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  RECOVERY_RESOLUTIONS,
  type RecoveryListFilters,
  type RecoveryQueueListRow,
  type RecoveryQueueRow,
  type RecoveryResolution,
} from "./types";

const RESOLVED_LOOKBACK_DAYS = 30;

/**
 * List queue rows for an org under the given filter bucket. Joins the
 * lead's label + state for the table render via a second batched query.
 */
export async function listRecoveryQueue(args: {
  organization_id: string;
  viewer_id: string;
  filters: RecoveryListFilters;
  client?: SupabaseClient;
}): Promise<RecoveryQueueListRow[]> {
  const client = args.client ?? getSupabaseAdmin();

  let q = client
    .from("customer_recovery_queue")
    .select("*")
    .eq("organization_id", args.organization_id);

  if (args.filters.bucket === "open") {
    q = q.is("resolved_at", null);
  } else if (args.filters.bucket === "mine") {
    q = q.is("resolved_at", null).eq("claimed_by", args.viewer_id);
  } else {
    const cutoff = new Date(
      Date.now() - RESOLVED_LOOKBACK_DAYS * 86_400_000,
    ).toISOString();
    q = q.not("resolved_at", "is", null).gte("resolved_at", cutoff);
  }

  if (args.filters.reason) {
    q = q.eq("recovery_reason", args.filters.reason);
  }

  q = q.order("added_at", { ascending: false }).limit(200);

  const { data, error } = await q;
  if (error || !data) return [];

  const rows = data as RecoveryQueueRow[];
  if (rows.length === 0) return [];

  // Batch-fetch lead labels + states (the codebase's listSiteVisits pattern).
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id)));
  const leadMap = new Map<string, { label: string | null; state: string | null }>();
  if (leadIds.length > 0) {
    const { data: leadRows } = await client
      .from("nodes")
      .select("id, label, state")
      .eq("organization_id", args.organization_id)
      .in("id", leadIds);
    for (const lr of (leadRows ?? []) as Array<{
      id: string;
      label: string | null;
      state: string | null;
    }>) {
      leadMap.set(lr.id, { label: lr.label, state: lr.state });
    }
  }

  return rows.map((r) => {
    const lead = leadMap.get(r.lead_id);
    return {
      ...r,
      lead_label: lead?.label ?? null,
      lead_state: lead?.state ?? null,
    };
  });
}

/**
 * Claim an open queue row for `user_id`. Conditional UPDATE on
 * `claimed_by IS NULL` — a concurrent claim wins exactly once; the
 * loser gets `already_claimed`.
 */
export async function claimRecoveryItem(args: {
  organization_id: string;
  queue_id: string;
  user_id: string;
  client?: SupabaseClient;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_claimed" | "resolved" | string }
> {
  const client = args.client ?? getSupabaseAdmin();

  const { data, error } = await client
    .from("customer_recovery_queue")
    .update({
      claimed_by: args.user_id,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", args.queue_id)
    .eq("organization_id", args.organization_id)
    .is("claimed_by", null)
    .is("resolved_at", null)
    .select("id");

  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) {
    const { data: existing } = await client
      .from("customer_recovery_queue")
      .select("claimed_by, resolved_at")
      .eq("id", args.queue_id)
      .eq("organization_id", args.organization_id)
      .maybeSingle();
    if (!existing) return { ok: false, reason: "not_found" };
    const row = existing as { claimed_by: string | null; resolved_at: string | null };
    if (row.resolved_at) return { ok: false, reason: "resolved" };
    if (row.claimed_by) return { ok: false, reason: "already_claimed" };
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}

/**
 * Resolve a queue row with a closed-enum resolution + optional note.
 * Sets resolved_at to now() and writes an audit_log row (inline, the
 * sitevisits / leads / brochures pattern — no shared helper).
 */
export async function resolveRecoveryItem(args: {
  organization_id: string;
  queue_id: string;
  user_id: string;
  resolution: RecoveryResolution;
  note?: string;
  client?: SupabaseClient;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_resolved" | "invalid_resolution" | string }
> {
  if (!RECOVERY_RESOLUTIONS.includes(args.resolution)) {
    return { ok: false, reason: "invalid_resolution" };
  }
  const client = args.client ?? getSupabaseAdmin();

  const { data, error } = await client
    .from("customer_recovery_queue")
    .update({
      resolved_at: new Date().toISOString(),
      resolution: args.resolution,
      note: args.note ?? null,
    })
    .eq("id", args.queue_id)
    .eq("organization_id", args.organization_id)
    .is("resolved_at", null)
    .select("id, lead_id");

  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) {
    const { data: existing } = await client
      .from("customer_recovery_queue")
      .select("resolved_at")
      .eq("id", args.queue_id)
      .eq("organization_id", args.organization_id)
      .maybeSingle();
    if (!existing) return { ok: false, reason: "not_found" };
    if ((existing as { resolved_at: string | null }).resolved_at) {
      return { ok: false, reason: "already_resolved" };
    }
    return { ok: false, reason: "not_found" };
  }

  const row = (data as Array<{ id: string; lead_id: string }>)[0];

  await client.from("audit_log").insert({
    actor_id: args.user_id,
    actor_type: "user",
    actor_role: "recovery_resolver",
    organization_id: args.organization_id,
    table_name: "customer_recovery_queue",
    record_id: row.id,
    action: "recovery_resolved",
    diff: {
      lead_id: row.lead_id,
      resolution: args.resolution,
    },
  });

  return { ok: true };
}
