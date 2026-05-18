import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  PLAN_TIERS,
  type PlanTier,
  type PlanTierLimits,
} from "@/lib/platform/plan-tiers";

/**
 * D-310 — DB-backed plan registry. Replaces the hardcoded PLAN_TIERS
 * constants as the canonical source. Constants stay as a fallback for
 * the migration window (and for tier 'custom' which is never seeded
 * with a Stripe price).
 */

export type PlanRow = {
  tier: PlanTier;
  display_name: string;
  monthly_price_inr: number | null;
  monthly_price_usd: number | null;
  stripe_price_id: string | null;
  max_users: number;
  max_active_properties: number;
  max_bookings_per_month: number;
  max_channel_partners: number;
  features: string[];
};

const SELECT_COLS =
  "tier, display_name, monthly_price_inr, monthly_price_usd, stripe_price_id, max_users, max_active_properties, max_bookings_per_month, max_channel_partners, features";

function fromConstant(t: PlanTier): PlanRow {
  const c: PlanTierLimits = PLAN_TIERS[t];
  return {
    tier: t,
    display_name: c.display_name,
    monthly_price_inr: c.monthly_price_inr,
    monthly_price_usd: null,
    stripe_price_id: null,
    max_users: c.max_users,
    max_active_properties: c.max_active_properties,
    max_bookings_per_month: c.max_bookings_per_month,
    max_channel_partners: c.max_channel_partners,
    features: c.features,
  };
}

export async function listPlans(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PlanRow[]> {
  const { data, error } = await client
    .from("subscription_plans")
    .select(SELECT_COLS)
    .is("deleted_at", null)
    .order("monthly_price_inr", { ascending: true, nullsFirst: false });
  if (error || !data) {
    return (Object.keys(PLAN_TIERS) as PlanTier[]).map(fromConstant);
  }
  return data as PlanRow[];
}

export async function getPlan(
  tier: PlanTier,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PlanRow> {
  const { data, error } = await client
    .from("subscription_plans")
    .select(SELECT_COLS)
    .eq("tier", tier)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return fromConstant(tier);
  }
  return data as PlanRow;
}
