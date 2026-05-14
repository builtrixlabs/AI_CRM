// D-617 (V6 Phase 1) — canned lead views for the Cmd+K shortcuts.
//
// Each slug maps to a FilterClause[] applied as ad-hoc filters on
// /dashboard/leads?canned=<slug>. Filters use compiler-reliable fields
// only: `state` (a real nodes column) and `data->>source` (exact jsonb
// text match) — never a jsonb-numeric range comparison.

import type { FilterClause } from "@/lib/views/types";

export const CANNED_LEAD_SLUGS = [
  "hot-leads",
  "new-leads",
  "contacted-leads",
  "qualified-leads",
  "terminal-leads",
  "leads-magicbricks",
  "leads-99acres",
  "leads-walkin",
] as const;
export type CannedLeadSlug = (typeof CANNED_LEAD_SLUGS)[number];

function stateEq(value: string): FilterClause {
  return { field: "state", kind: "builtin_state", op: "eq", value };
}
function stateIn(value: string[]): FilterClause {
  return { field: "state", kind: "builtin_state", op: "in", value };
}
function sourceEq(value: string): FilterClause {
  return { field: "data->>source", kind: "string", op: "eq", value };
}

const CANNED: Record<
  CannedLeadSlug,
  { label: string; filters: FilterClause[] }
> = {
  // "Hot" = the active funnel. An intent-score range would need an
  // unreliable jsonb-numeric comparison — see directives/617 Risks.
  "hot-leads": {
    label: "Hot leads",
    filters: [stateIn(["contacted", "qualified"])],
  },
  "new-leads": { label: "New leads", filters: [stateEq("new")] },
  "contacted-leads": {
    label: "Contacted leads",
    filters: [stateEq("contacted")],
  },
  "qualified-leads": {
    label: "Qualified leads",
    filters: [stateEq("qualified")],
  },
  "terminal-leads": {
    label: "Terminal leads",
    filters: [stateIn(["lost", "junk", "on_hold"])],
  },
  "leads-magicbricks": {
    label: "Leads from magicbricks",
    filters: [sourceEq("magicbricks")],
  },
  "leads-99acres": {
    label: "Leads from 99acres",
    filters: [sourceEq("99acres")],
  },
  "leads-walkin": { label: "Walk-in leads", filters: [sourceEq("walkin")] },
};

export function isCannedLeadSlug(slug: string): slug is CannedLeadSlug {
  return (CANNED_LEAD_SLUGS as readonly string[]).includes(slug);
}

/** FilterClause[] for a canned slug, or null for an unknown slug. */
export function cannedLeadFilters(slug: string): FilterClause[] | null {
  return isCannedLeadSlug(slug) ? CANNED[slug].filters : null;
}

/** Human label for a canned slug, or null for an unknown slug. */
export function cannedLeadLabel(slug: string): string | null {
  return isCannedLeadSlug(slug) ? CANNED[slug].label : null;
}
