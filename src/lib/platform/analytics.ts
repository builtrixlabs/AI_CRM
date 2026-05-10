import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PLAN_TIER_ORDER, type PlanTier } from "./plan-tiers";

/**
 * D-312 — time-series analytics over a configurable window.
 *
 * One bucket per UTC day: new bookings, deals entering the qualifying
 * funnel, site visits completed / no-show. Shapes per spec AC-4.
 *
 * Pure-ish: takes an injectable client; default reads via admin so
 * super-admin pages can render without per-tenant scoping.
 */
export type AnalyticsBucket = {
  date: string;
  bookings: number;
  qualified_starts: number;
  sv_completed: number;
  sv_no_show: number;
};

const FUNNEL_STATES = new Set([
  "qualified",
  "site_visit_scheduled",
  "site_visit_done",
  "negotiation",
  "booked",
]);

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptyBuckets(days: number): AnalyticsBucket[] {
  const out: AnalyticsBucket[] = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    out.push({
      date: isoDay(d),
      bookings: 0,
      qualified_starts: 0,
      sv_completed: 0,
      sv_no_show: 0,
    });
  }
  return out;
}

export async function getKpisOverWindow(
  days: number,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<AnalyticsBucket[]> {
  const buckets = emptyBuckets(days);
  const byDate = new Map(buckets.map((b) => [b.date, b]));

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  // Deals: count by state transitions in the window. We use updated_at
  // as the proxy for "state changed on this day" — accurate for v3 MVP
  // because deal state is the dominant axis of mutation. A V3.x
  // refinement could join audit_log for true transition history.
  const dealsRes = await client
    .from("nodes")
    .select("data, updated_at")
    .eq("kind", "deal")
    .gte("updated_at", since.toISOString())
    .is("deleted_at", null);
  if (!dealsRes.error && dealsRes.data) {
    for (const row of dealsRes.data as Array<{
      data: { state?: string };
      updated_at: string;
    }>) {
      const day = row.updated_at.slice(0, 10);
      const b = byDate.get(day);
      if (!b) continue;
      const state = row.data?.state;
      if (state === "booked") b.bookings += 1;
      if (state && FUNNEL_STATES.has(state)) b.qualified_starts += 1;
    }
  }

  // Site visits: count completed / no-show by scheduled_at day in window.
  const svRes = await client
    .from("nodes")
    .select("data")
    .eq("kind", "site_visit")
    .gte("updated_at", since.toISOString())
    .is("deleted_at", null);
  if (!svRes.error && svRes.data) {
    for (const row of svRes.data as Array<{
      data: { state?: string; scheduled_at?: string };
    }>) {
      const sa = row.data?.scheduled_at;
      if (!sa) continue;
      const day = sa.slice(0, 10);
      const b = byDate.get(day);
      if (!b) continue;
      if (row.data.state === "completed") b.sv_completed += 1;
      if (row.data.state === "no_show") b.sv_no_show += 1;
    }
  }

  return buckets;
}

export function bucketsToCsv(
  kpi: "bookings" | "qualified_starts" | "sv_completed" | "sv_no_show",
  buckets: AnalyticsBucket[]
): string {
  const header = `date,${kpi}\n`;
  const rows = buckets
    .map((b) => `${b.date},${b[kpi]}`)
    .join("\n");
  return header + rows + "\n";
}


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
