import { describe, expect, it } from "vitest";
import {
  DEAL_STAGE_ORDER,
  IllegalDealTransitionError,
  assertTransitionAllowed,
  isForwardTransition,
  isOverrideRequired,
  isTerminalStage,
  type DealStage,
} from "@/lib/deals/transitions";

const STAGES = [...DEAL_STAGE_ORDER];

describe("deals/transitions.isForwardTransition", () => {
  it("same-stage is forward (no-op allowed)", () => {
    for (const s of STAGES) expect(isForwardTransition(s, s)).toBe(true);
  });

  it("strictly forward pairs are forward", () => {
    expect(isForwardTransition("qualified", "site_visit_scheduled")).toBe(true);
    expect(isForwardTransition("site_visit_scheduled", "site_visit_done")).toBe(
      true
    );
    expect(isForwardTransition("site_visit_done", "negotiation")).toBe(true);
    expect(isForwardTransition("negotiation", "booked")).toBe(true);
    expect(isForwardTransition("qualified", "booked")).toBe(true);
  });

  it("backward pairs are NOT forward", () => {
    expect(isForwardTransition("booked", "negotiation")).toBe(false);
    expect(isForwardTransition("site_visit_done", "qualified")).toBe(false);
  });

  it("'lost' is forward from any non-booked stage", () => {
    expect(isForwardTransition("qualified", "lost")).toBe(true);
    expect(isForwardTransition("negotiation", "lost")).toBe(true);
    expect(isForwardTransition("booked", "lost")).toBe(false); // already booked
  });
});

describe("deals/transitions.isOverrideRequired", () => {
  it("forward never requires override", () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        if (isForwardTransition(from, to)) {
          expect(isOverrideRequired(from, to)).toBe(false);
        }
      }
    }
  });

  it("backward always requires override", () => {
    expect(isOverrideRequired("booked", "qualified")).toBe(true);
    expect(isOverrideRequired("negotiation", "site_visit_done")).toBe(true);
  });
});

describe("deals/transitions.isTerminalStage", () => {
  it("booked + lost are terminal; others are not", () => {
    expect(isTerminalStage("booked")).toBe(true);
    expect(isTerminalStage("lost")).toBe(true);
    for (const s of STAGES.filter((s) => s !== "booked")) {
      expect(isTerminalStage(s)).toBe(false);
    }
  });
});

describe("deals/transitions.assertTransitionAllowed", () => {
  it("forward allowed without override", () => {
    expect(() =>
      assertTransitionAllowed("qualified", "site_visit_scheduled", false)
    ).not.toThrow();
  });

  it("backward without override throws backward_no_override", () => {
    try {
      assertTransitionAllowed("negotiation", "qualified", false);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalDealTransitionError);
      if (e instanceof IllegalDealTransitionError) {
        expect(e.reason).toBe("backward_no_override");
      }
    }
  });

  it("backward with override allowed", () => {
    expect(() =>
      assertTransitionAllowed("negotiation", "qualified", true)
    ).not.toThrow();
  });

  it("from terminal without override throws from_terminal", () => {
    try {
      assertTransitionAllowed("booked", "negotiation", false);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalDealTransitionError);
      if (e instanceof IllegalDealTransitionError) {
        expect(e.reason).toBe("from_terminal");
      }
    }
  });

  it("from terminal with override allowed", () => {
    expect(() =>
      assertTransitionAllowed("booked", "negotiation", true)
    ).not.toThrow();
  });

  it("unknown stage throws unknown_stage", () => {
    try {
      assertTransitionAllowed("qualified", "weird" as DealStage, true);
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalDealTransitionError);
      if (e instanceof IllegalDealTransitionError) {
        expect(e.reason).toBe("unknown_stage");
      }
    }
  });
});
