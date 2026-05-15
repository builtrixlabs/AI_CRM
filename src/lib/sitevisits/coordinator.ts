// D-602 (V6 Phase 1) — site-visit coordinator claims.
//
// "One coordinator per org per day" is enforced atomically by the
// composite PRIMARY KEY (organization_id, coordination_date) on
// site_visit_coordinator_claims: the second claimant's INSERT hits a
// unique-violation (Postgres 23505), surfaced here as `already_claimed`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CoordinatorClaim = {
  organization_id: string;
  coordination_date: string;
  coordinator_id: string;
  claimed_at: string;
};

export type ClaimResult =
  | { ok: true; claim: CoordinatorClaim }
  | { ok: false; reason: "already_claimed"; coordinator_id: string }
  | { ok: false; reason: "error"; message: string };

export type ReleaseResult =
  | { ok: true }
  | { ok: false; reason: "not_claimant" | "error"; message?: string };

/**
 * Atomic coordinator claim for (org, day). A bare INSERT — the PK does
 * the mutual exclusion. No read-then-write race window.
 */
export async function claimCoordination(
  args: {
    organization_id: string;
    coordinator_id: string;
    coordination_date: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ClaimResult> {
  const { data, error } = await client
    .from("site_visit_coordinator_claims")
    .insert({
      organization_id: args.organization_id,
      coordination_date: args.coordination_date,
      coordinator_id: args.coordinator_id,
    })
    .select("organization_id, coordination_date, coordinator_id, claimed_at")
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation — the (org, date) slot is already claimed.
    if ((error as { code?: string }).code === "23505") {
      const existing = await getCoordinatorForDate(
        args.organization_id,
        args.coordination_date,
        client,
      );
      return {
        ok: false,
        reason: "already_claimed",
        coordinator_id: existing?.coordinator_id ?? "unknown",
      };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true, claim: data as CoordinatorClaim };
}

/**
 * Release the caller's own claim. Idempotent (releasing a non-existent
 * claim is a no-op success). Refuses to release another user's claim.
 */
export async function releaseCoordination(
  args: {
    organization_id: string;
    coordinator_id: string;
    coordination_date: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ReleaseResult> {
  const existing = await getCoordinatorForDate(
    args.organization_id,
    args.coordination_date,
    client,
  );
  if (!existing) return { ok: true };
  if (existing.coordinator_id !== args.coordinator_id) {
    return { ok: false, reason: "not_claimant" };
  }
  const { error } = await client
    .from("site_visit_coordinator_claims")
    .delete()
    .eq("organization_id", args.organization_id)
    .eq("coordination_date", args.coordination_date);
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true };
}

/** Who, if anyone, holds the coordination claim for (org, date). */
export async function getCoordinatorForDate(
  organization_id: string,
  coordination_date: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<CoordinatorClaim | null> {
  const { data, error } = await client
    .from("site_visit_coordinator_claims")
    .select("organization_id, coordination_date, coordinator_id, claimed_at")
    .eq("organization_id", organization_id)
    .eq("coordination_date", coordination_date)
    .maybeSingle();
  if (error || !data) return null;
  return data as CoordinatorClaim;
}
