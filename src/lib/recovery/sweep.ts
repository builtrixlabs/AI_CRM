/**
 * D-616 — Customer Recovery sweep.
 *
 * Every 6h, classify leads in terminal or cold states and insert open
 * customer_recovery_queue rows. The classifier is pure; the candidate
 * finder + enqueue + the per-org cron entry sit on top.
 *
 * PRD shorthand reconciliation: PRD says `state in ('lost','stale')`.
 * Lead states are [new, contacted, qualified, lost, on_hold, junk] —
 * "stale" is a behavioural descriptor. The classifier emits four
 * reasons; D-322's 7-day follow-up sweep covers the new/contacted
 * 7-14 day window, so D-616 picks up at 14+ days on contacted/qualified
 * and treats lost / on_hold as terminal-recovery.
 *
 * Idempotency: a partial-unique index on (organization_id, lead_id)
 * WHERE resolved_at IS NULL guards duplicate open rows; a duplicate
 * insert is a benign 23505 caught as `already_queued`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  STALE_RECOVERY_DAYS,
  type RecoveryReason,
  type RecoveryQueueRow,
} from "./types";

type LeadRow = {
  id: string;
  organization_id: string;
  state: string | null;
  created_at: string;
  updated_at: string | null;
  data: { last_contact_at?: string } | null;
};

export type RecoveryCandidate = {
  lead_id: string;
  organization_id: string;
  recovery_reason: RecoveryReason;
};

/**
 * Pure classifier. Returns the recovery reason for a lead, or null if
 * the lead is not a recovery candidate.
 *
 * Terminal-recovery: state in (lost, on_hold) → reason mirrors state.
 * Stale-recovery: state in (contacted, qualified) AND last touch
 *   was >= STALE_RECOVERY_DAYS days ago.
 * Excluded: new (too early; D-322 covers it), qualified-recent,
 *   contacted-recent, junk (bad data).
 */
export function classifyRecoveryReason(
  row: Pick<LeadRow, "state" | "created_at" | "updated_at" | "data">,
  now: Date = new Date(),
): RecoveryReason | null {
  if (!row.state) return null;
  if (row.state === "lost") return "lost";
  if (row.state === "on_hold") return "on_hold";
  if (row.state !== "contacted" && row.state !== "qualified") return null;

  const last = lastTouchMs(row, now.getTime());
  const ageDays = Math.floor((now.getTime() - last) / 86_400_000);
  if (ageDays < STALE_RECOVERY_DAYS) return null;

  return row.state === "contacted" ? "stale_contacted" : "stale_qualified";
}

function lastTouchMs(
  row: Pick<LeadRow, "created_at" | "updated_at" | "data">,
  now_ms: number,
): number {
  const lastContact = row.data?.last_contact_at
    ? Date.parse(row.data.last_contact_at)
    : 0;
  const updated = row.updated_at ? Date.parse(row.updated_at) : 0;
  const created = Date.parse(row.created_at);
  const t = Math.max(lastContact || 0, updated || 0, created || 0);
  return Number.isFinite(t) && t > 0 ? t : now_ms;
}

/**
 * Find recovery candidates for an org and dedupe against open queue
 * rows. Caps at 500 leads per org per tick — the same defensive cap
 * D-322 uses. Returns an empty array if nothing qualifies.
 */
export async function findRecoveryCandidates(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<RecoveryCandidate[]> {
  const { data: leads, error } = await client
    .from("nodes")
    .select("id, organization_id, state, created_at, updated_at, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "lead")
    .in("state", ["lost", "on_hold", "contacted", "qualified"])
    .is("deleted_at", null)
    .limit(500);
  if (error || !leads) return [];

  const candidates: RecoveryCandidate[] = [];
  for (const row of leads as LeadRow[]) {
    const reason = classifyRecoveryReason(row, now);
    if (!reason) continue;
    candidates.push({
      lead_id: row.id,
      organization_id: row.organization_id,
      recovery_reason: reason,
    });
  }
  if (candidates.length === 0) return candidates;

  // Dedup: drop candidates with an existing open queue row.
  const ids = candidates.map((c) => c.lead_id);
  const { data: open } = await client
    .from("customer_recovery_queue")
    .select("lead_id")
    .eq("organization_id", organization_id)
    .is("resolved_at", null)
    .in("lead_id", ids);
  const alreadyOpen = new Set(
    (open ?? []).map((r) => (r as { lead_id: string }).lead_id),
  );
  return candidates.filter((c) => !alreadyOpen.has(c.lead_id));
}

/**
 * Insert an open queue row. Returns `already_queued` on the partial-
 * unique conflict (a race where the same lead got enqueued between
 * findRecoveryCandidates' dedup read and our insert).
 */
export async function enqueueRecoveryCandidate(
  candidate: RecoveryCandidate,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<
  | { ok: true; queue_id: string }
  | { ok: false; error: "already_queued" | string }
> {
  const { data, error } = await client
    .from("customer_recovery_queue")
    .insert({
      organization_id: candidate.organization_id,
      lead_id: candidate.lead_id,
      recovery_reason: candidate.recovery_reason,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505" || /duplicate/i.test(error.message ?? "")) {
      return { ok: false, error: "already_queued" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, queue_id: (data as { id: string }).id };
}

/**
 * Cron entry: for each org, find recovery candidates + enqueue them.
 * Per-org failures are caught + counted; one bad org never blocks the
 * others. Same posture as D-322's `runFollowUpAgent`.
 */
export async function runRecoverySweep(
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{
  orgs_scanned: number;
  rows_enqueued: number;
  skipped_dup: number;
  org_errors: number;
}> {
  const summary = {
    orgs_scanned: 0,
    rows_enqueued: 0,
    skipped_dup: 0,
    org_errors: 0,
  };

  const { data: orgs } = await client
    .from("organizations")
    .select("id")
    .is("deleted_at", null);

  for (const o of (orgs ?? []) as { id: string }[]) {
    summary.orgs_scanned += 1;
    try {
      const candidates = await findRecoveryCandidates(o.id, client);
      for (const c of candidates) {
        const r = await enqueueRecoveryCandidate(c, client);
        if (r.ok) summary.rows_enqueued += 1;
        else if (r.error === "already_queued") summary.skipped_dup += 1;
      }
    } catch {
      summary.org_errors += 1;
    }
  }

  return summary;
}

export type { RecoveryQueueRow };
