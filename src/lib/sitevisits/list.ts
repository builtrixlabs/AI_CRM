// D-602 (V6 Phase 1) — site-visit list query for /dashboard/site-visits.
//
// Site visits are `nodes` rows (baseline/110 §I). This builds the
// filterable, role-scoped list. SQL narrows by org + type + state +
// project / sales-rep / coordinator + a padded scheduled_at window;
// role-scoping and exact IST-day bucketing are finished in JS over the
// (small, org-bounded) result set — see Risks & decisions in
// directives/602-site-visit-module.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BaseRole } from "@/lib/auth/types";
import type { SiteVisitState } from "./transitions";
import { istDayKey, SITE_VISIT_DEFAULT_TZ } from "./ist";

/**
 * Roles that see every site visit in the org. Everyone else (the rep
 * tier) sees only visits they are assigned to / coordinating / created.
 */
export const FULL_VISIBILITY_ROLES: ReadonlySet<BaseRole> =
  new Set<BaseRole>([
    "org_owner",
    "org_admin",
    "workspace_admin",
    "manager",
    "site_visit_coordinator",
  ]);

export type SiteVisitFilters = {
  /** Specific IST day, "YYYY-MM-DD". Takes precedence over `bucket`. */
  date?: string;
  /** "today" = current IST day; "upcoming" = scheduled_at >= now. */
  bucket?: "today" | "upcoming";
  status?: SiteVisitState;
  project_id?: string;
  sales_rep_id?: string;
  coordinator_id?: string;
};

export type SiteVisitListRow = {
  id: string;
  state: SiteVisitState | null;
  scheduled_at: string | null;
  lead_id: string | null;
  lead_label: string | null;
  project_id: string | null;
  coordinator_id: string | null;
  assigned_sales_rep_id: string | null;
  created_by: string;
  created_at: string;
};

export type ListSiteVisitsArgs = {
  organization_id: string;
  viewer: { user_id: string; base_role: BaseRole };
  filters?: SiteVisitFilters;
  tz?: string;
  /** Injectable for deterministic date-relative tests. */
  now?: Date;
};

type NodeRow = {
  id: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
};

export async function listSiteVisits(
  args: ListSiteVisitsArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<SiteVisitListRow[]> {
  const tz = args.tz ?? SITE_VISIT_DEFAULT_TZ;
  const now = args.now ?? new Date();
  const filters = args.filters ?? {};

  let q = client
    .from("nodes")
    .select("id, state, data, created_by, created_at")
    .eq("organization_id", args.organization_id)
    .eq("node_type", "site_visit")
    .is("deleted_at", null);

  if (filters.status) q = q.eq("state", filters.status);
  if (filters.project_id) q = q.eq("data->>project_id", filters.project_id);
  if (filters.sales_rep_id) {
    q = q.eq("data->>assigned_sales_rep_id", filters.sales_rep_id);
  }
  if (filters.coordinator_id) {
    q = q.eq("data->>coordinator_id", filters.coordinator_id);
  }

  // A specific IST `date` (or `bucket='today'`) needs a JS post-filter:
  // the stored scheduled_at is UTC and IST-day boundaries don't align, so
  // the SQL window deliberately over-selects (±18h / +42h pad) and JS
  // trims to the exact IST day below.
  const dayKey =
    filters.date ?? (filters.bucket === "today" ? istDayKey(now, tz) : null);

  if (dayKey) {
    const anchor = new Date(`${dayKey}T00:00:00Z`).getTime();
    q = q
      .gte(
        "data->>scheduled_at",
        new Date(anchor - 18 * 3600_000).toISOString(),
      )
      .lte(
        "data->>scheduled_at",
        new Date(anchor + 42 * 3600_000).toISOString(),
      );
  } else if (filters.bucket === "upcoming") {
    q = q.gte("data->>scheduled_at", now.toISOString());
  }

  const { data, error } = await q;
  if (error || !data) return [];
  let rows = data as NodeRow[];

  // Role-scoping (AC-4) in JS — the org + type + state SQL filters have
  // already narrowed to a bounded set; this avoids a JSONB-path .or() on
  // the hot query.
  if (!FULL_VISIBILITY_ROLES.has(args.viewer.base_role)) {
    const uid = args.viewer.user_id;
    rows = rows.filter((r) => {
      const d = r.data ?? {};
      return (
        d.assigned_sales_rep_id === uid ||
        d.coordinator_id === uid ||
        r.created_by === uid
      );
    });
  }

  // Exact IST-day trim (the SQL window over-selects).
  if (dayKey) {
    rows = rows.filter((r) => {
      const at = r.data?.scheduled_at;
      if (typeof at !== "string") return false;
      const inst = new Date(at);
      return !Number.isNaN(inst.getTime()) && istDayKey(inst, tz) === dayKey;
    });
  }

  // Sort by scheduled_at ascending (JS — avoids ordering by a JSONB path).
  rows.sort((a, b) => {
    const av = typeof a.data?.scheduled_at === "string" ? a.data.scheduled_at : "";
    const bv = typeof b.data?.scheduled_at === "string" ? b.data.scheduled_at : "";
    return av < bv ? -1 : av > bv ? 1 : 0;
  });

  // Resolve lead labels in one batched query.
  const leadIds = Array.from(
    new Set(
      rows
        .map((r) => r.data?.lead_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  );
  const leadLabels = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leadRows } = await client
      .from("nodes")
      .select("id, label")
      .eq("organization_id", args.organization_id)
      .in("id", leadIds);
    for (const lr of (leadRows ?? []) as Array<{ id: string; label: string }>) {
      leadLabels.set(lr.id, lr.label);
    }
  }

  return rows.map((r) => {
    const d = r.data ?? {};
    const lead_id = typeof d.lead_id === "string" ? d.lead_id : null;
    return {
      id: r.id,
      state: (r.state as SiteVisitState | null) ?? null,
      scheduled_at: typeof d.scheduled_at === "string" ? d.scheduled_at : null,
      lead_id,
      lead_label: lead_id ? (leadLabels.get(lead_id) ?? null) : null,
      project_id: typeof d.project_id === "string" ? d.project_id : null,
      coordinator_id:
        typeof d.coordinator_id === "string" ? d.coordinator_id : null,
      assigned_sales_rep_id:
        typeof d.assigned_sales_rep_id === "string"
          ? d.assigned_sales_rep_id
          : null,
      created_by: r.created_by,
      created_at: r.created_at,
    };
  });
}
