import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BookingStage } from "./stages";
import { BOOKING_STAGES } from "./stages";
import type { StageTransition } from "./types";

/**
 * D-421 — booking pipeline data fetchers.
 *
 * Service-role reads match the pattern in src/lib/deals/api.ts: the canvas
 * page authenticates via getCurrentUser() and scopes by URL param. Mutating
 * paths go through user-scoped clients + the SECURITY DEFINER RPC.
 */

const STAGE_SET = new Set<string>(BOOKING_STAGES);

function asStage(v: unknown): BookingStage | null {
  return typeof v === "string" && STAGE_SET.has(v) ? (v as BookingStage) : null;
}

export type DealBookingState = {
  currentStage: BookingStage | null;
  transitions: StageTransition[];
};

export async function getDealBookingState(
  deal_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<DealBookingState> {
  // Read current_stage from the deal row.
  const { data: dealRow } = await client
    .from("nodes")
    .select("id, current_stage, node_type")
    .eq("id", deal_id)
    .eq("node_type", "deal")
    .is("deleted_at", null)
    .maybeSingle();

  const currentStage = dealRow
    ? asStage((dealRow as { current_stage: unknown }).current_stage)
    : null;

  // Fetch transition history, newest first.
  const { data: rows } = await client
    .from("stage_transitions")
    .select(
      "id, deal_id, organization_id, from_stage, to_stage, actor_user_id, actor_kind, triggered_by, evidence, idempotency_key, skip_reason, correction_reason, occurred_at"
    )
    .eq("deal_id", deal_id)
    .order("occurred_at", { ascending: false });

  const transitions: StageTransition[] = ((rows ?? []) as Array<
    Record<string, unknown>
  >).map((r) => ({
    id: String(r.id),
    deal_id: String(r.deal_id),
    organization_id: String(r.organization_id),
    from_stage: asStage(r.from_stage),
    to_stage: (asStage(r.to_stage) ?? "eoi") as BookingStage,
    actor_user_id: (r.actor_user_id as string | null) ?? null,
    actor_kind: (r.actor_kind as "user" | "agent" | "system") ?? "system",
    triggered_by: (r.triggered_by as string | null) ?? null,
    evidence: (r.evidence as Record<string, unknown>) ?? {},
    idempotency_key: String(r.idempotency_key),
    skip_reason: (r.skip_reason as string | null) ?? null,
    correction_reason: (r.correction_reason as string | null) ?? null,
    occurred_at: String(r.occurred_at),
  }));

  return { currentStage, transitions };
}
