import { ALLOWED_STATES } from "@/lib/nodes/states";

// Single source of truth — derived from the baseline/110 §III lifecycle
// list (amended to 7 states by D-602). Keeps the calendar widget in lock-
// step with src/lib/nodes/states.ts and src/lib/sitevisits/transitions.ts.
export type SiteVisitState = (typeof ALLOWED_STATES.site_visit)[number];

export type CalendarDay = {
  date: string;
  date_utc: string;
  total: number;
  by_state: Record<SiteVisitState, number>;
};

/**
 * The single tint a calendar day cell shows. Priority: problem states
 * first (no_show, then cancelled), otherwise the most-common live state.
 */
export function dominantState(day: CalendarDay): SiteVisitState | null {
  if (day.total === 0) return null;
  if (day.by_state.no_show > 0) return "no_show";
  if (day.by_state.cancelled > 0) return "cancelled";
  let best: SiteVisitState = "scheduled";
  let bestN = -1;
  for (const s of [
    "draft",
    "scheduled",
    "confirmed",
    "in_progress",
    "completed",
  ] as const) {
    if (day.by_state[s] > bestN) {
      best = s;
      bestN = day.by_state[s];
    }
  }
  return best;
}
