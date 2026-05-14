// D-605 (V6 Phase 1) — Command Center home data fetch.
//
// One role-scoped lead fetch + a deals fetch + a recent-activity fetch +
// an agent_approval_queue fetch, aggregated in JS into a single payload
// for the six dashboard widgets. Org-scoped on every query; the rep tier
// additionally narrows to leads/activities the viewer owns.
//
// JS aggregation (not COUNT round-trips) sidesteps the jsonb-numeric
// comparison trap — `data->>'intent_score'` is text, so a SQL `.gte`
// would compare lexically. At V6 pilot scale the single fetch is well
// within the AC-1 latency budget. Mirrors D-602's listSiteVisits shape.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BaseRole } from "@/lib/auth/types";

const FULL_VISIBILITY_ROLES: ReadonlySet<BaseRole> = new Set<BaseRole>([
  "org_owner",
  "org_admin",
  "workspace_admin",
  "manager",
]);

// An activity node is connected to a lead via one of these edge types.
const ACTIVITY_EDGE_TYPES = ["mentioned_in", "related_to", "belongs_to"];
const ACTIVE_LEAD_STATES = new Set(["new", "contacted", "qualified"]);
const HOT_INTENT_THRESHOLD = 70;
const TZ = process.env.NEXT_PUBLIC_DEFAULT_TZ ?? "Asia/Kolkata";

export type CommandCenterViewer = {
  user_id: string;
  organization_id: string;
  base_role: BaseRole;
};

export type CcKpis = {
  active_leads: number;
  hot_pipeline: number;
  avg_intent: number;
  closed_mtd: number;
};
export type CcPulseActivity = {
  id: string;
  label: string;
  created_via: string;
  created_at: string;
  channel: string | null;
};
export type CcVolumeDay = { date: string; count: number; avg_intent: number };
export type CcAgentic = {
  pending: number;
  approved: number;
  sent_today: number;
  rejected: number;
};
export type CcStateCount = { state: string; count: number };
export type CcHotLead = {
  id: string;
  label: string;
  intent_score: number;
  phone: string | null;
};
export type CommandCenterData = {
  scope: "org" | "personal";
  has_any_data: boolean;
  kpis: CcKpis;
  pulse: CcPulseActivity[];
  volume: CcVolumeDay[];
  agentic: CcAgentic;
  states: CcStateCount[];
  hot_leads: CcHotLead[];
};

type LeadRow = {
  id: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
};
type DealRow = {
  id: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_by: string;
  updated_at: string;
};
type ActivityRow = {
  id: string;
  label: string;
  data: Record<string, unknown> | null;
  created_via: string;
  created_at: string;
};

function istDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function intentOf(data: Record<string, unknown> | null): number | null {
  const v = data?.intent_score;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function ownsNode(
  row: { data: Record<string, unknown> | null; created_by: string },
  uid: string,
): boolean {
  const d = row.data ?? {};
  return d.assigned_sales_rep_id === uid || row.created_by === uid;
}

function mapActivities(rows: ActivityRow[]): CcPulseActivity[] {
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    created_via: r.created_via,
    created_at: r.created_at,
    channel: typeof r.data?.channel === "string" ? r.data.channel : null,
  }));
}

async function fetchPulse(
  client: SupabaseClient,
  orgId: string,
  full: boolean,
  leadIds: string[],
): Promise<CcPulseActivity[]> {
  if (full) {
    const res = await client
      .from("nodes")
      .select("id, label, data, created_via, created_at")
      .eq("organization_id", orgId)
      .eq("node_type", "activity")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    return mapActivities((res.data as ActivityRow[] | null) ?? []);
  }
  // Rep tier — activities edge-linked to the viewer's leads. Two `.in()`
  // queries (rather than a JSONB-path `.or()`) keep this on the index.
  if (leadIds.length === 0) return [];
  const [fromRes, toRes] = await Promise.all([
    client
      .from("edges")
      .select("to_node_id")
      .eq("organization_id", orgId)
      .in("edge_type", ACTIVITY_EDGE_TYPES)
      .in("from_node_id", leadIds)
      .is("deleted_at", null),
    client
      .from("edges")
      .select("from_node_id")
      .eq("organization_id", orgId)
      .in("edge_type", ACTIVITY_EDGE_TYPES)
      .in("to_node_id", leadIds)
      .is("deleted_at", null),
  ]);
  const activityIds = new Set<string>();
  for (const e of (fromRes.data as Array<{ to_node_id: string }> | null) ?? []) {
    activityIds.add(e.to_node_id);
  }
  for (const e of (toRes.data as Array<{ from_node_id: string }> | null) ?? []) {
    activityIds.add(e.from_node_id);
  }
  if (activityIds.size === 0) return [];
  const res = await client
    .from("nodes")
    .select("id, label, data, created_via, created_at")
    .eq("organization_id", orgId)
    .eq("node_type", "activity")
    .in("id", Array.from(activityIds))
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return mapActivities((res.data as ActivityRow[] | null) ?? []);
}

export async function getCommandCenterData(
  viewer: CommandCenterViewer,
  client: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date(),
): Promise<CommandCenterData> {
  const full = FULL_VISIBILITY_ROLES.has(viewer.base_role);
  const scope: "org" | "personal" = full ? "org" : "personal";
  const orgId = viewer.organization_id;
  const uid = viewer.user_id;

  // 1. Leads — org-scoped fetch, JS role-scope.
  const leadsRes = await client
    .from("nodes")
    .select("id, state, data, created_by, created_at")
    .eq("organization_id", orgId)
    .eq("node_type", "lead")
    .is("deleted_at", null);
  let leads = (leadsRes.data as LeadRow[] | null) ?? [];
  if (!full) leads = leads.filter((l) => ownsNode(l, uid));

  // 2. Deals — for closed_mtd.
  const dealsRes = await client
    .from("nodes")
    .select("id, state, data, created_by, updated_at")
    .eq("organization_id", orgId)
    .eq("node_type", "deal")
    .is("deleted_at", null);
  let deals = (dealsRes.data as DealRow[] | null) ?? [];
  if (!full) deals = deals.filter((d) => ownsNode(d, uid));

  // 3. agent_approval_queue — org-scoped for all roles.
  const aqRes = await client
    .from("agent_approval_queue")
    .select("status, decided_at")
    .eq("organization_id", orgId);
  const aqRows =
    (aqRes.data as Array<{ status: string; decided_at: string | null }> | null) ??
    [];

  // 4. Recent activities — role-scoped.
  const pulse = await fetchPulse(
    client,
    orgId,
    full,
    leads.map((l) => l.id),
  );

  // ── KPIs ──
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const active_leads = leads.filter(
    (l) => l.state !== null && ACTIVE_LEAD_STATES.has(l.state),
  ).length;
  const hot_pipeline = leads.filter(
    (l) => (intentOf(l.data) ?? 0) >= HOT_INTENT_THRESHOLD,
  ).length;

  const recentIntents = leads
    .filter((l) => l.created_at >= thirtyDaysAgo)
    .map((l) => intentOf(l.data))
    .filter((v): v is number => v !== null);
  const avg_intent =
    recentIntents.length > 0
      ? Math.round(
          recentIntents.reduce((s, v) => s + v, 0) / recentIntents.length,
        )
      : 0;

  const closed_mtd = deals.filter(
    (d) => d.state === "booked" && d.updated_at >= monthStart,
  ).length;

  // ── per-day volume (current month) ──
  const monthPrefix = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;
  const volMap = new Map<
    string,
    { count: number; intentSum: number; intentN: number }
  >();
  for (const l of leads) {
    const day = istDay(l.created_at);
    if (!day.startsWith(monthPrefix)) continue;
    const b = volMap.get(day) ?? { count: 0, intentSum: 0, intentN: 0 };
    b.count += 1;
    const iv = intentOf(l.data);
    if (iv !== null) {
      b.intentSum += iv;
      b.intentN += 1;
    }
    volMap.set(day, b);
  }
  const volume: CcVolumeDay[] = Array.from(volMap.entries())
    .map(([date, b]) => ({
      date,
      count: b.count,
      avg_intent: b.intentN > 0 ? Math.round(b.intentSum / b.intentN) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // ── agentic ──
  const todayKey = istDay(now.toISOString());
  const agentic: CcAgentic = {
    pending: aqRows.filter((r) => r.status === "pending").length,
    approved: aqRows.filter((r) => r.status === "approved").length,
    sent_today: aqRows.filter(
      (r) =>
        r.status === "sent" &&
        r.decided_at !== null &&
        istDay(r.decided_at) === todayKey,
    ).length,
    rejected: aqRows.filter((r) => r.status === "rejected").length,
  };

  // ── lead-state distribution ──
  const stateMap = new Map<string, number>();
  for (const l of leads) {
    const s = l.state ?? "unknown";
    stateMap.set(s, (stateMap.get(s) ?? 0) + 1);
  }
  const states: CcStateCount[] = Array.from(stateMap.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);

  // ── hot leads (top 5 by intent) ──
  const hot_leads: CcHotLead[] = leads
    .map((l) => ({
      id: l.id,
      label:
        (typeof l.data?.name === "string" && l.data.name) ||
        (typeof l.data?.phone === "string" && l.data.phone) ||
        l.id,
      intent_score: intentOf(l.data) ?? 0,
      phone: typeof l.data?.phone === "string" ? l.data.phone : null,
    }))
    .filter((h) => h.intent_score > 0)
    .sort((a, b) => b.intent_score - a.intent_score)
    .slice(0, 5);

  return {
    scope,
    has_any_data: leads.length > 0,
    kpis: { active_leads, hot_pipeline, avg_intent, closed_mtd },
    pulse,
    volume,
    agentic,
    states,
    hot_leads,
  };
}
