import { LEAD_STATES, type LeadState } from "./types";

export { LEAD_STATES, type LeadState };

/**
 * V0 lead-only state graph.
 *
 *   new        → contacted, qualified, lost, on_hold, junk
 *   contacted  → qualified,            lost, on_hold, junk
 *   qualified  →                       lost, on_hold, junk   (deal promotion is V1)
 *   lost       → ∅   (terminal, sticky in V0)
 *   on_hold    → ∅
 *   junk       → ∅
 */
export const TRANSITIONS: Readonly<Record<LeadState, readonly LeadState[]>> = {
  new: ["contacted", "qualified", "lost", "on_hold", "junk"],
  contacted: ["qualified", "lost", "on_hold", "junk"],
  qualified: ["lost", "on_hold", "junk"],
  lost: [],
  on_hold: [],
  junk: [],
};

export const TERMINAL_STATES: ReadonlySet<LeadState> = new Set<LeadState>([
  "lost",
  "on_hold",
  "junk",
]);

export function isTerminal(state: LeadState): boolean {
  return TERMINAL_STATES.has(state);
}

export function allowedTransitions(from: LeadState): readonly LeadState[] {
  return TRANSITIONS[from];
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: LeadState,
    public readonly to: LeadState,
  ) {
    super(`IllegalTransitionError: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransitionAllowed(
  from: LeadState,
  to: LeadState,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}
