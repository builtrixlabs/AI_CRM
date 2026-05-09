import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PLAN_TIER_ORDER, type PlanTier } from "./plan-tiers";

export type SiteVisitStateCounts = {
  scheduled: number;
  confirmed: number;
  completed: number;
  no_show: number;
  total: number;
};

export type PlatformKpis = {
  orgs_by_plan_tier: Record<PlanTier, number>;
  total_orgs: number;
  conversion: {
    qualified_or_later: number;
    booked: number;
    rate_pct: number;
  };
  site_visits_30d: SiteVisitStateCounts;
  voice_iq_adoption: {
    orgs_with_voice_iq: number;
    total_orgs: number;
    rate_pct: number;
  };
};

const DOWNSTREAM_DEAL_STATES = new Set([
  "qualified",
  "site_visit_scheduled",
  "site_visit_done",
  "negotiation",
  "booked",
]);

const SV_STATES = ["scheduled", "confirmed", "completed", "no_show"] as const;
type SvState = (typeof SV_STATES)[number];
function isSvState(s: string | null): s is SvState {
  return s !== null && (SV_STATES as ReadonlyArray<string>).includes(s);
}

export async function getPlatformKpis(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PlatformKpis> {
  const orgs = await client
    .from("organizations")
    .select("id, plan_tier")
    .is("deleted_at", null);

  const tierCounts: Record<PlanTier, number> = {
    starter: 0,
    professional: 0,
    enterprise: 0,
    custom: 0,
  };
  let total_orgs = 0;
  if (!orgs.error && orgs.data) {
    for (const o of orgs.data as Array<{ plan_tier: string }>) {
      total_orgs += 1;
      const t = o.plan_tier as PlanTier;
      if (PLAN_TIER_ORDER.includes(t)) tierCounts[t] += 1;
    }
  }

  // Conversion: count qualified-or-later deals; booked / those.
  const deals = await client
    .from("nodes")
    .select("state")
    .eq("node_type", "deal")
    .is("deleted_at", null);
  let qualifiedOrLater = 0;
  let booked = 0;
  if (!deals.error && deals.data) {
    for (const d of deals.data as Array<{ state: string | null }>) {
      if (!d.state) continue;
      if (DOWNSTREAM_DEAL_STATES.has(d.state)) qualifiedOrLater += 1;
      if (d.state === "booked") booked += 1;
    }
  }
  const conversionPct =
    qualifiedOrLater > 0 ? (booked / qualifiedOrLater) * 100 : 0;

  // Site-visit cadence: 30 days.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const visits = await client
    .from("nodes")
    .select("state, data")
    .eq("node_type", "site_visit")
    .is("deleted_at", null)
    .gte("data->>scheduled_at", since);
  const visitCounts: SiteVisitStateCounts = {
    scheduled: 0,
    confirmed: 0,
    completed: 0,
    no_show: 0,
    total: 0,
  };
  if (!visits.error && visits.data) {
    for (const v of visits.data as Array<{ state: string | null }>) {
      if (isSvState(v.state)) {
        visitCounts[v.state] += 1;
        visitCounts.total += 1;
      }
    }
  }

  // Voice IQ adoption.
  const viq = await client
    .from("org_integration_secrets")
    .select("organization_id")
    .eq("kind", "voice_iq_inbox_secret");
  const orgs_with_voice_iq =
    !viq.error && viq.data
      ? new Set(
          (viq.data as Array<{ organization_id: string }>).map(
            (r) => r.organization_id
          )
        ).size
      : 0;
  const viqPct = total_orgs > 0 ? (orgs_with_voice_iq / total_orgs) * 100 : 0;

  return {
    orgs_by_plan_tier: tierCounts,
    total_orgs,
    conversion: {
      qualified_or_later: qualifiedOrLater,
      booked,
      rate_pct: conversionPct,
    },
    site_visits_30d: visitCounts,
    voice_iq_adoption: {
      orgs_with_voice_iq,
      total_orgs,
      rate_pct: viqPct,
    },
  };
}
