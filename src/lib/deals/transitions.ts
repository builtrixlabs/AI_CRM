/**
 * D-321 — deal stage state machine. Mirrors D-007 lead-lifecycle pattern
 * + D-320 catalog one-way-with-override semantics.
 *
 * Forward axis:
 *   qualified -> site_visit_scheduled -> site_visit_done -> negotiation -> booked
 *
 * Plus terminal `lost` (allowed from any non-booked stage) and
 * same-stage no-op.
 *
 * Backward steps require `deals:admin_override` (V3.x can split that
 * into a dedicated perm; for v3 MVP we reuse `catalog:admin_override`
 * since it's the same kind of "an admin says it's OK to revert").
 */

export const DEAL_STAGE_ORDER = [
  "qualified",
  "site_visit_scheduled",
  "site_visit_done",
  "negotiation",
  "booked",
] as const;

export type DealStage = (typeof DEAL_STAGE_ORDER)[number] | "lost";

const FORWARD_INDEX = new Map<string, number>(
  DEAL_STAGE_ORDER.map((s, i) => [s, i])
);

export class IllegalDealTransitionError extends Error {
  constructor(
    public from: DealStage,
    public to: DealStage,
    public reason: "unknown_stage" | "backward_no_override" | "from_terminal"
  ) {
    super(`Illegal deal transition ${from} -> ${to} (${reason})`);
    this.name = "IllegalDealTransitionError";
  }
}

export function isTerminalStage(s: DealStage): boolean {
  return s === "booked" || s === "lost";
}

export function isForwardTransition(from: DealStage, to: DealStage): boolean {
  if (from === to) return true;
  if (to === "lost" && from !== "booked") return true;
  const i = FORWARD_INDEX.get(from);
  const j = FORWARD_INDEX.get(to);
  if (i === undefined || j === undefined) return false;
  return j > i;
}

export function isOverrideRequired(from: DealStage, to: DealStage): boolean {
  if (from === to) return false;
  if (isForwardTransition(from, to)) return false;
  return true;
}

export function assertTransitionAllowed(
  from: DealStage,
  to: DealStage,
  has_override: boolean
): void {
  if (from === to) return;
  if (isTerminalStage(from)) {
    if (!has_override) {
      throw new IllegalDealTransitionError(from, to, "from_terminal");
    }
    return;
  }
  if (!FORWARD_INDEX.has(from) && from !== "lost") {
    throw new IllegalDealTransitionError(from, to, "unknown_stage");
  }
  if (to !== "lost" && !FORWARD_INDEX.has(to)) {
    throw new IllegalDealTransitionError(from, to, "unknown_stage");
  }
  if (isForwardTransition(from, to)) return;
  if (!has_override) {
    throw new IllegalDealTransitionError(from, to, "backward_no_override");
  }
}
