/**
 * D-420 — Unit availability state machine (7-state).
 *
 * Pure, side-effect-free. Mirrors the SQL graph in `transition_unit_state`
 * RPC (supabase/migrations/20260511190000_re_inventory.sql). Keep the two in
 * sync — diverging is the source of subtle "the RPC says yes but the UI says
 * no" bugs.
 *
 * State graph (forward edges; same-state always allowed and is a no-op):
 *
 *   available ─→ held       (rep soft-hold; TTL = 24h)
 *             ─→ blocked    (manager-confirmed block; TTL = 7d)
 *             ─→ booked     (token paid — irreversible without override)
 *   held      ─→ blocked    (escalate hold to a block)
 *             ─→ booked     (token paid from hold)
 *             ─→ available  (release)
 *   blocked   ─→ booked     (token paid from block)
 *             ─→ available  (release)
 *   booked    ─→ sold       (sale agreement signed)
 *   sold      ─→ registered (sale deed registered)
 *   registered─→ possessed  (handover complete)
 *   possessed ─→ (terminal)
 *
 * Anything else (backward, non-adjacent) requires `catalog:admin_override`.
 */

export const INVENTORY_STATES = [
  "available",
  "held",
  "blocked",
  "booked",
  "sold",
  "registered",
  "possessed",
] as const;

export type UnitState = (typeof INVENTORY_STATES)[number];

/**
 * Allowed forward transitions per current state. Includes same-state as
 * a no-op (callers don't have to special-case identity).
 */
export const ALLOWED_FORWARD: Readonly<Record<UnitState, ReadonlyArray<UnitState>>> = {
  available:  ["available", "held", "blocked", "booked"],
  held:       ["held", "blocked", "booked", "available"],
  blocked:    ["blocked", "booked", "available"],
  booked:     ["booked", "sold"],
  sold:       ["sold", "registered"],
  registered: ["registered", "possessed"],
  possessed:  ["possessed"],
};

/** Default hold TTL — matches the RPC default. */
export const DEFAULT_HOLD_HOURS = 24;

/** Default block TTL — matches the RPC default. */
export const DEFAULT_BLOCK_DAYS = 7;

export function isValidState(s: unknown): s is UnitState {
  return typeof s === "string" && (INVENTORY_STATES as readonly string[]).includes(s);
}

export function isForwardTransition(from: UnitState, to: UnitState): boolean {
  return ALLOWED_FORWARD[from].includes(to);
}

export function isOverrideRequired(from: UnitState, to: UnitState): boolean {
  if (from === to) return false;
  return !isForwardTransition(from, to);
}

export type TransitionErrorReason =
  | "unknown_state"
  | "illegal_transition"
  | "backward_no_override";

export class IllegalUnitTransitionError extends Error {
  constructor(
    public readonly from: UnitState | string,
    public readonly to: UnitState | string,
    public readonly reason: TransitionErrorReason,
  ) {
    super(`Illegal unit transition ${from} -> ${to} (${reason})`);
    this.name = "IllegalUnitTransitionError";
  }
}

/**
 * Throws `IllegalUnitTransitionError` if the transition violates the graph.
 * Same-state is always a silent no-op.
 *
 * Override semantics:
 *   - `has_override = true` allows ANY transition between known states
 *     (modeling the `catalog:admin_override` permission).
 *   - `has_override = false` only allows the edges in `ALLOWED_FORWARD`.
 *
 * `unknown_state` short-circuits the check regardless of override —
 * an unknown state name is always an error.
 */
export function assertTransitionAllowed(
  from: UnitState | string,
  to: UnitState | string,
  has_override: boolean,
): void {
  if (!isValidState(from) || !isValidState(to)) {
    throw new IllegalUnitTransitionError(from, to, "unknown_state");
  }
  if (from === to) return;
  if (isForwardTransition(from, to)) return;

  // Either backward or non-adjacent forward — both gated by override.
  if (!has_override) {
    const reason: TransitionErrorReason = isForwardTransition(to, from)
      ? "backward_no_override"
      : "illegal_transition";
    throw new IllegalUnitTransitionError(from, to, reason);
  }
}
