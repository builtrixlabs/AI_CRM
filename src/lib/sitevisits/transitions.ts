import { ALLOWED_STATES } from "@/lib/nodes/states";

export const SITE_VISIT_STATES = ALLOWED_STATES.site_visit;

export type SiteVisitState = (typeof ALLOWED_STATES.site_visit)[number];

/**
 *   scheduled  → confirmed, completed, no_show
 *   confirmed  → completed, no_show
 *   completed  → ∅ (terminal)
 *   no_show    → ∅ (terminal)
 */
export const TRANSITIONS: Readonly<Record<SiteVisitState, readonly SiteVisitState[]>> = {
  scheduled: ["confirmed", "completed", "no_show"],
  confirmed: ["completed", "no_show"],
  completed: [],
  no_show: [],
};

export const TERMINAL_STATES: ReadonlySet<SiteVisitState> = new Set<SiteVisitState>([
  "completed",
  "no_show",
]);

export function isTerminal(state: SiteVisitState): boolean {
  return TERMINAL_STATES.has(state);
}

export function allowedTransitions(from: SiteVisitState): readonly SiteVisitState[] {
  return TRANSITIONS[from] ?? [];
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: SiteVisitState,
    public readonly to: SiteVisitState
  ) {
    super(`IllegalTransitionError(site_visit): ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransitionAllowed(
  from: SiteVisitState,
  to: SiteVisitState
): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}
