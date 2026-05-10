/**
 * V3.x — Stale-Lead Watcher (T0).
 *
 * Backlog item 39. Sits before the D-322 Follow-up agent in the agent
 * pipeline. Job: identify "warm-but-quiet" leads that the follow-up
 * agent should consider, applying signal-richness filters that the
 * follow-up agent itself doesn't bother with (it consumes whatever the
 * watcher hands it).
 *
 * T0 means "no LLM, no I/O beyond DB read"; it's a pure scorer + filter.
 * Output is a candidate list (UUID + reason) that downstream agents
 * (or operator dashboards) can consume.
 *
 * Signal-richness rules (intentionally conservative for V3.x):
 *   - Lead state must be in (new, contacted, qualified).
 *   - Lead must have a phone OR an email.
 *   - Last activity (max of created_at, data.last_contact_at) must be
 *     between STALE_FROM and STALE_UNTIL days ago — sleeping but not
 *     dead. Default 7..30.
 *   - Lead must NOT already have a pending agent_approval_queue row
 *     (cheap dedupe; partial-unique index on the queue table is the
 *     authoritative dedupe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const STALE_FROM_DAYS = 7;
export const STALE_UNTIL_DAYS = 30;
const ACCEPTED_STATES = new Set(["new", "contacted", "qualified"]);

export type WatcherCandidate = {
  lead_id: string;
  organization_id: string;
  reason: "warm_quiet";
  staleness_days: number;
  signal_count: number;
};

type LeadRow = {
  id: string;
  organization_id: string;
  state: string | null;
  created_at: string;
  data: { phone?: string; email?: string; last_contact_at?: string } | null;
};

function lastTouchMs(row: LeadRow, now_ms: number): number {
  const created = Date.parse(row.created_at);
  const last = row.data?.last_contact_at ? Date.parse(row.data.last_contact_at) : 0;
  const t = Math.max(created || 0, last || 0);
  return Number.isFinite(t) ? t : now_ms;
}

export function scoreLead(row: LeadRow, now: Date = new Date()): WatcherCandidate | null {
  if (!row.state || !ACCEPTED_STATES.has(row.state)) return null;
  const phone = row.data?.phone?.trim();
  const email = row.data?.email?.trim();
  const signal_count = (phone ? 1 : 0) + (email ? 1 : 0);
  if (signal_count === 0) return null;

  const days = Math.floor((now.getTime() - lastTouchMs(row, now.getTime())) / 86_400_000);
  if (days < STALE_FROM_DAYS || days > STALE_UNTIL_DAYS) return null;

  return {
    lead_id: row.id,
    organization_id: row.organization_id,
    reason: "warm_quiet",
    staleness_days: days,
    signal_count,
  };
}

export async function findStaleLeadCandidates(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<WatcherCandidate[]> {
  const fromIso = new Date(now.getTime() - STALE_UNTIL_DAYS * 86_400_000).toISOString();

  const { data: leads, error } = await client
    .from("nodes")
    .select("id, organization_id, state, created_at, data")
    .eq("organization_id", organization_id)
    .eq("kind", "lead")
    .gte("created_at", fromIso)
    .is("deleted_at", null)
    .limit(500);
  if (error || !leads) return [];

  const candidates: WatcherCandidate[] = [];
  for (const row of leads as LeadRow[]) {
    const c = scoreLead(row, now);
    if (c) candidates.push(c);
  }

  if (candidates.length === 0) return candidates;

  // Dedupe: drop leads with an existing pending row in agent_approval_queue.
  const ids = candidates.map((c) => c.lead_id);
  const { data: pending } = await client
    .from("agent_approval_queue")
    .select("source_lead_id")
    .eq("organization_id", organization_id)
    .eq("status", "pending")
    .in("source_lead_id", ids);
  const queued = new Set(
    (pending ?? []).map((r) => (r as { source_lead_id: string }).source_lead_id),
  );
  return candidates.filter((c) => !queued.has(c.lead_id));
}
