import type { NodeType } from "./types";

/**
 * Allowed lifecycle states per node_type. Empty array = stateless type.
 * Per PRD §8.2. Once ratified into baseline/110-graph-data-model.md, these
 * lists cannot change without an amendment directive (Constitution VI).
 */
export const ALLOWED_STATES: Record<NodeType, readonly string[]> = {
  lead: [
    "new",
    "contacted",
    "qualified",
    // terminals (PRD §8.1)
    "lost",
    "on_hold",
    "junk",
  ],
  contact: [],
  deal: [
    "qualified",
    "site_visit_scheduled",
    "site_visit_done",
    "negotiation",
    "booked",
    // terminals
    "lost",
    "on_hold",
  ],
  property: ["available", "held", "booked", "sold"],
  unit: ["available", "held", "booked", "sold"],
  site_visit: ["scheduled", "confirmed", "completed", "no_show"],
  call: [],
  activity: [],
  document: ["uploaded", "verified", "signed"],
  note: [],
} as const;

const TERMINAL_STATES: Partial<Record<NodeType, readonly string[]>> = {
  lead: ["lost", "junk", "on_hold"],
  deal: ["lost", "booked", "on_hold"],
  property: ["sold"],
  unit: ["sold"],
  site_visit: ["completed", "no_show"],
  document: ["signed"],
};

const ALLOWED_SETS = Object.fromEntries(
  Object.entries(ALLOWED_STATES).map(([k, v]) => [k, new Set(v)])
) as unknown as Record<NodeType, ReadonlySet<string>>;

/**
 * True iff `state` is valid for this node_type. For stateless types (empty
 * allowed list), only null/undefined are valid. For stateful types,
 * null/undefined are NOT valid — caller must set an initial state.
 */
export function validateState(
  type: NodeType,
  state: string | null | undefined
): boolean {
  const allowed = ALLOWED_STATES[type];
  if (allowed.length === 0) {
    return state == null;
  }
  if (state == null) return false;
  return ALLOWED_SETS[type].has(state);
}

export function isTerminalState(
  type: NodeType,
  state: string | null | undefined
): boolean {
  if (state == null) return false;
  const set = TERMINAL_STATES[type];
  return set ? set.includes(state) : false;
}
