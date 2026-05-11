/**
 * D-421 — verify the DEAL_STAGES / DealStage / DEAL_STAGE_LABEL alias exports
 * required by baseline 118 AC-8 resolve to the same runtime values as the
 * existing BOOKING_STAGES / BookingStage / BOOKING_STAGE_LABEL.
 *
 * The aliases exist purely to honor the spec naming contract — a single
 * source-of-truth list, two exported names.
 */
import { describe, expect, it } from "vitest";
import {
  BOOKING_STAGES,
  BOOKING_STAGE_LABEL,
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  type BookingStage,
  type DealStage,
} from "@/lib/booking/stages";

describe("DEAL_STAGES aliases (baseline 118 AC-8)", () => {
  it("DEAL_STAGES is the same reference as BOOKING_STAGES", () => {
    expect(DEAL_STAGES).toBe(BOOKING_STAGES);
  });

  it("DEAL_STAGE_LABEL is the same reference as BOOKING_STAGE_LABEL", () => {
    expect(DEAL_STAGE_LABEL).toBe(BOOKING_STAGE_LABEL);
  });

  it("DealStage type is assignable from BookingStage and vice-versa", () => {
    const a: DealStage = "eoi";
    const b: BookingStage = a;
    const c: DealStage = b;
    expect(c).toBe("eoi");
  });

  it("covers all 8 canonical stages in order", () => {
    expect([...DEAL_STAGES]).toEqual([
      "eoi",
      "token",
      "booking",
      "sale_agreement",
      "loan_finance",
      "registration",
      "possession",
      "handover_complete",
    ]);
  });
});
