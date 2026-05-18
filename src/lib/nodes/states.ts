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
  // Project lifecycle (PRD §3 P8) — Pre-launch / Launch / Construction / OC /
  // Handover. D-420 ships a stateless project row by default; the lifecycle
  // states land with the customer-facing project canvas (deferred D-421).
  project: [],
  // Tower inherits its parent project's lifecycle. Stateless at the row level.
  tower: [],
  property: ["available", "held", "booked", "sold"],
  // D-420 — 7-state unit availability machine. Legacy 4-state rows (D-320)
  // still validate because the old states are a subset of the new set.
  unit: [
    "available",
    "held",
    "blocked",
    "booked",
    "sold",
    "registered",
    "possessed",
  ],
  // D-602 (V6 Phase 1) amends baseline/110 §III: the 4-state site_visit
  // lifecycle becomes the 7-state PRD-v6.0 §D-602 workflow. Pre-V6 rows
  // still validate — the prior states are a strict subset of the new set.
  site_visit: [
    "draft",
    "scheduled",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
  ],
  call: [],
  activity: [],
  document: ["uploaded", "verified", "signed"],
  note: [],
} as const;

const TERMINAL_STATES: Partial<Record<NodeType, readonly string[]>> = {
  lead: ["lost", "junk", "on_hold"],
  deal: ["lost", "booked", "on_hold"],
  property: ["sold"],
  unit: ["possessed"],
  site_visit: ["completed", "cancelled", "no_show"],
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
