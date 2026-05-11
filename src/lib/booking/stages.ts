/**
 * D-421 — booking pipeline stage machine (client-side type + matrix mirror).
 *
 * Authority anchor: baseline/118-booking-pipeline-contract.md §3 (enum) + §4
 * (transition matrix). The Postgres `deal_stage` enum and the
 * `transition_stage` RPC are the trust-bearing implementations; this file
 * mirrors the rules client-side ONLY to drive UI affordances (which buttons
 * to render, which dialogs to allow). The server is the gate; never
 * validate-then-trust on the client.
 */

export const BOOKING_STAGES = [
  "eoi",
  "token",
  "booking",
  "sale_agreement",
  "loan_finance",
  "registration",
  "possession",
  "handover_complete",
] as const;

export type BookingStage = (typeof BOOKING_STAGES)[number];

export const BOOKING_STAGE_LABEL: Record<BookingStage, string> = {
  eoi: "EOI",
  token: "Token",
  booking: "Booking",
  sale_agreement: "Sale Agreement",
  loan_finance: "Loan / Finance",
  registration: "Registration",
  possession: "Possession",
  handover_complete: "Handover Complete",
};

const ORDINAL = new Map<BookingStage, number>(
  BOOKING_STAGES.map((s, i) => [s, i])
);

export function stageOrdinal(s: BookingStage): number {
  return ORDINAL.get(s) ?? -1;
}

export type ForwardSkipReason = "cash_buyer" | "fully_cashed";

export function isCanonicalForward(
  from: BookingStage,
  to: BookingStage
): boolean {
  return stageOrdinal(to) === stageOrdinal(from) + 1;
}

export function isAllowedSkip(
  from: BookingStage,
  to: BookingStage,
  skipReason?: string | null
): boolean {
  if (from === "eoi" && to === "booking" && skipReason === "cash_buyer") {
    return true;
  }
  if (
    from === "sale_agreement" &&
    to === "registration" &&
    skipReason === "fully_cashed"
  ) {
    return true;
  }
  return false;
}

export function isForwardTransition(
  from: BookingStage,
  to: BookingStage,
  skipReason?: string | null
): boolean {
  return isCanonicalForward(from, to) || isAllowedSkip(from, to, skipReason);
}

export function isBackwardCorrection(
  from: BookingStage,
  to: BookingStage
): boolean {
  return stageOrdinal(to) === stageOrdinal(from) - 1;
}

/**
 * Stages the UI should offer as forward targets from `from`. Drives the
 * forward-transition dialog's stage selector. Returns:
 *   - the canonical next stage (always)
 *   - any skip targets keyed off `from`
 * Empty array means `from` is terminal (handover_complete).
 */
export function allowedForwardTargets(
  from: BookingStage
): Array<{ to: BookingStage; skipReason?: ForwardSkipReason }> {
  const out: Array<{ to: BookingStage; skipReason?: ForwardSkipReason }> = [];
  const nextIdx = stageOrdinal(from) + 1;
  if (nextIdx < BOOKING_STAGES.length) {
    out.push({ to: BOOKING_STAGES[nextIdx]! });
  }
  if (from === "eoi") {
    out.push({ to: "booking", skipReason: "cash_buyer" });
  }
  if (from === "sale_agreement") {
    out.push({ to: "registration", skipReason: "fully_cashed" });
  }
  return out;
}

/**
 * The single backward target from `from` (one step back) if any.
 * Used to populate the correction dialog; the actual permission check
 * lives at the RPC + the UI gates the button by user role.
 */
export function backwardCorrectionTarget(
  from: BookingStage
): BookingStage | null {
  const prevIdx = stageOrdinal(from) - 1;
  if (prevIdx < 0) return null;
  return BOOKING_STAGES[prevIdx] ?? null;
}

export function isTerminal(s: BookingStage): boolean {
  return s === "handover_complete";
}
