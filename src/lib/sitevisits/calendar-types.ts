export type SiteVisitState = "scheduled" | "confirmed" | "completed" | "no_show";

export type CalendarDay = {
  date: string;
  date_utc: string;
  total: number;
  by_state: Record<SiteVisitState, number>;
};

export function dominantState(day: CalendarDay): SiteVisitState | null {
  if (day.total === 0) return null;
  if (day.by_state.no_show > 0) return "no_show";
  let best: SiteVisitState = "scheduled";
  let bestN = -1;
  for (const s of ["scheduled", "confirmed", "completed"] as const) {
    if (day.by_state[s] > bestN) {
      best = s;
      bestN = day.by_state[s];
    }
  }
  return best;
}
