import type { UnitStatus } from "./queries";

/**
 * D-320 — unit-status state machine.
 *
 * Forward axis is `available → held → booked → sold`. Backward
 * transitions are blocked unless the caller holds `catalog:admin_override`.
 *
 * Pattern matches the lead-lifecycle state machine from D-007: pure
 * `Readonly<Record<S, S[]>>` plus typed error class.
 */

export const STATUS_ORDER: ReadonlyArray<UnitStatus> = [
  "available",
  "held",
  "booked",
  "sold",
] as const;

function indexOf(s: UnitStatus): number {
  const i = STATUS_ORDER.indexOf(s);
  return i < 0 ? -1 : i;
}

/** Allowed targets per current state — forward steps + same-state idempotency. */
export const ALLOWED_FORWARD: Readonly<Record<UnitStatus, UnitStatus[]>> = {
  available: ["available", "held"],
  held: ["held", "booked"],
  booked: ["booked", "sold"],
  sold: ["sold"],
};

export function isForwardTransition(
  from: UnitStatus,
  to: UnitStatus
): boolean {
  if (from === to) return true;
  const i = indexOf(from);
  const j = indexOf(to);
  if (i < 0 || j < 0) return false;
  return j > i;
}

export function isOverrideRequired(
  from: UnitStatus,
  to: UnitStatus
): boolean {
  if (from === to) return false;
  const i = indexOf(from);
  const j = indexOf(to);
  if (i < 0 || j < 0) return false;
  return j < i;
}

export class IllegalUnitTransitionError extends Error {
  constructor(
    public from: UnitStatus,
    public to: UnitStatus,
    public reason: "unknown_state" | "backward_no_override"
  ) {
    super(`Illegal unit transition ${from} -> ${to} (${reason})`);
    this.name = "IllegalUnitTransitionError";
  }
}

/**
 * Throws `IllegalUnitTransitionError` if the transition is not allowed.
 * Same-state is always a no-op.
 */
export function assertTransitionAllowed(
  from: UnitStatus,
  to: UnitStatus,
  has_override: boolean
): void {
  if (from === to) return;
  const i = indexOf(from);
  const j = indexOf(to);
  if (i < 0 || j < 0) {
    throw new IllegalUnitTransitionError(from, to, "unknown_state");
  }
  if (j < i && !has_override) {
    throw new IllegalUnitTransitionError(from, to, "backward_no_override");
  }
}
