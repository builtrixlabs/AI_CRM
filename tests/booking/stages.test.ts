import { describe, expect, it } from "vitest";
import {
  BOOKING_STAGES,
  BOOKING_STAGE_LABEL,
  allowedForwardTargets,
  backwardCorrectionTarget,
  isAllowedSkip,
  isBackwardCorrection,
  isCanonicalForward,
  isForwardTransition,
  isTerminal,
  stageOrdinal,
} from "@/lib/booking/stages";

describe("D-421 booking stage matrix (client mirror)", () => {
  describe("BOOKING_STAGES enum", () => {
    it("has 8 stages in the canonical order", () => {
      expect(BOOKING_STAGES).toEqual([
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

    it("has a label for every stage", () => {
      for (const s of BOOKING_STAGES) {
        expect(BOOKING_STAGE_LABEL[s]).toBeTruthy();
      }
    });
  });

  describe("stageOrdinal", () => {
    it("returns 0 for eoi and 7 for handover_complete", () => {
      expect(stageOrdinal("eoi")).toBe(0);
      expect(stageOrdinal("handover_complete")).toBe(7);
    });
  });

  describe("isCanonicalForward", () => {
    it("allows forward by one", () => {
      expect(isCanonicalForward("eoi", "token")).toBe(true);
      expect(isCanonicalForward("registration", "possession")).toBe(true);
    });
    it("rejects forward by two", () => {
      expect(isCanonicalForward("eoi", "booking")).toBe(false);
    });
    it("rejects same-stage and backward", () => {
      expect(isCanonicalForward("token", "token")).toBe(false);
      expect(isCanonicalForward("booking", "token")).toBe(false);
    });
  });

  describe("isAllowedSkip", () => {
    it("allows eoi → booking with cash_buyer", () => {
      expect(isAllowedSkip("eoi", "booking", "cash_buyer")).toBe(true);
    });
    it("rejects eoi → booking without skip_reason", () => {
      expect(isAllowedSkip("eoi", "booking", null)).toBe(false);
      expect(isAllowedSkip("eoi", "booking", undefined)).toBe(false);
      expect(isAllowedSkip("eoi", "booking", "other")).toBe(false);
    });
    it("allows sale_agreement → registration with fully_cashed", () => {
      expect(
        isAllowedSkip("sale_agreement", "registration", "fully_cashed")
      ).toBe(true);
    });
    it("rejects other skip combinations", () => {
      expect(isAllowedSkip("token", "sale_agreement", "cash_buyer")).toBe(
        false
      );
      expect(
        isAllowedSkip("loan_finance", "possession", "fully_cashed")
      ).toBe(false);
    });
  });

  describe("isForwardTransition", () => {
    it("returns true for canonical forward or allowed skip", () => {
      expect(isForwardTransition("eoi", "token")).toBe(true);
      expect(isForwardTransition("eoi", "booking", "cash_buyer")).toBe(true);
      expect(
        isForwardTransition("sale_agreement", "registration", "fully_cashed")
      ).toBe(true);
    });
    it("returns false for forward-by-two without skip", () => {
      expect(isForwardTransition("eoi", "booking")).toBe(false);
    });
  });

  describe("isBackwardCorrection", () => {
    it("returns true for single-step backward", () => {
      expect(isBackwardCorrection("token", "eoi")).toBe(true);
      expect(isBackwardCorrection("possession", "registration")).toBe(true);
    });
    it("returns false for forward, same, or multi-step backward", () => {
      expect(isBackwardCorrection("eoi", "token")).toBe(false);
      expect(isBackwardCorrection("token", "token")).toBe(false);
      expect(isBackwardCorrection("booking", "eoi")).toBe(false);
    });
  });

  describe("allowedForwardTargets", () => {
    it("returns canonical next + cash_buyer skip from eoi", () => {
      const t = allowedForwardTargets("eoi");
      expect(t).toEqual([
        { to: "token" },
        { to: "booking", skipReason: "cash_buyer" },
      ]);
    });

    it("returns canonical next + fully_cashed skip from sale_agreement", () => {
      const t = allowedForwardTargets("sale_agreement");
      expect(t).toEqual([
        { to: "loan_finance" },
        { to: "registration", skipReason: "fully_cashed" },
      ]);
    });

    it("returns only canonical next from token", () => {
      expect(allowedForwardTargets("token")).toEqual([{ to: "booking" }]);
    });

    it("returns empty array from terminal (handover_complete)", () => {
      expect(allowedForwardTargets("handover_complete")).toEqual([]);
    });
  });

  describe("backwardCorrectionTarget", () => {
    it("returns the previous stage", () => {
      expect(backwardCorrectionTarget("token")).toBe("eoi");
      expect(backwardCorrectionTarget("handover_complete")).toBe("possession");
    });
    it("returns null from eoi (no previous stage)", () => {
      expect(backwardCorrectionTarget("eoi")).toBe(null);
    });
  });

  describe("isTerminal", () => {
    it("returns true only for handover_complete", () => {
      expect(isTerminal("handover_complete")).toBe(true);
      expect(isTerminal("possession")).toBe(false);
      expect(isTerminal("eoi")).toBe(false);
    });
  });
});
