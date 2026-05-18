/**
 * V3.x — auto-suspend cron when grace_period_until expires.
 *
 * D-310 ships a 30-day grace window after invoice.payment_failed. V3.0
 * required a super_admin to manually flip status to suspended once the
 * grace expired. This module sweeps subscriptions whose
 * grace_period_until <= now() and are still in past_due, and transitions
 * them to suspended (force-sign-out included via the revocation upsert).
 *
 * Pure-ish: takes an injectable client. Returns a summary so the cron
 * caller logs meaningfully. Idempotent — running twice in the same minute
 * has no effect after the first sweep.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AutoSuspendSummary = {
  scanned: number;
  suspended: number;
  errors: Array<{ organization_id: string; error: string }>;
};

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

export async function runAutoSuspendSweep(
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<AutoSuspendSummary> {
  const summary: AutoSuspendSummary = { scanned: 0, suspended: 0, errors: [] };

  const { data: rows, error: selErr } = await client
    .from("subscriptions")
    .select("organization_id, grace_period_until, status")
    .eq("status", "past_due")
    .lte("grace_period_until", now.toISOString())
    .not("grace_period_until", "is", null);
  if (selErr || !rows) return summary;

  summary.scanned = rows.length;

  for (const r of rows as Array<{ organization_id: string; grace_period_until: string; status: string }>) {
    // Update subscription → suspended.
    const { error: subErr } = await client
      .from("subscriptions")
      .update({
        status: "suspended",
        updated_at: now.toISOString(),
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .eq("organization_id", r.organization_id)
      .eq("status", "past_due"); // optimistic guard against races
    if (subErr) {
      summary.errors.push({ organization_id: r.organization_id, error: subErr.message });
      continue;
    }
    // Force sign-out (D-302 pattern).
    const { error: revErr } = await client.from("org_session_revocations").upsert(
      {
        organization_id: r.organization_id,
        revoked_at: now.toISOString(),
        revoked_by: SYSTEM_UUID,
        reason: "grace_period_expired",
      },
      { onConflict: "organization_id" },
    );
    if (revErr) {
      summary.errors.push({ organization_id: r.organization_id, error: revErr.message });
      continue;
    }
    // Append audit row.
    await client.from("audit_log").insert({
      organization_id: r.organization_id,
      actor_id: SYSTEM_UUID,
      actor_type: "system",
      actor_role: "system",
      table_name: "subscriptions",
      record_id: r.organization_id,
      action: "auto_suspended_grace_expired",
      diff: { reason: "grace_period_expired", grace_period_until: r.grace_period_until },
    });
    summary.suspended += 1;
  }

  return summary;
}
