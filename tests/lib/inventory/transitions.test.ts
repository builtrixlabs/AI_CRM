import { describe, expect, it } from "vitest";
import {
  ALLOWED_FORWARD,
  IllegalUnitTransitionError,
  INVENTORY_STATES,
  assertTransitionAllowed,
  isForwardTransition,
  isOverrideRequired,
  isValidState,
  DEFAULT_HOLD_HOURS,
  DEFAULT_BLOCK_DAYS,
  type UnitState,
} from "@/lib/inventory/transitions";

const STATES: UnitState[] = [...INVENTORY_STATES];

describe("inventory/transitions — graph shape", () => {
  it("covers all 7 PRD v3.0 §3 P4 states", () => {
    expect(INVENTORY_STATES).toEqual([
      "available",
      "held",
      "blocked",
      "booked",
      "sold",
      "registered",
      "possessed",
    ]);
  });

  it("every state lists itself as a same-state transition", () => {
    for (const s of STATES) {
      expect(ALLOWED_FORWARD[s]).toContain(s);
    }
  });

  it("possessed is terminal — only self-edge", () => {
    expect(ALLOWED_FORWARD.possessed).toEqual(["possessed"]);
  });

  it("default TTLs match PRD (24h / 7d)", () => {
    expect(DEFAULT_HOLD_HOURS).toBe(24);
    expect(DEFAULT_BLOCK_DAYS).toBe(7);
  });
});

describe("inventory/transitions.isValidState", () => {
  it("admits every state in the literal tuple", () => {
    for (const s of STATES) expect(isValidState(s)).toBe(true);
  });
  it("rejects null/undefined/unknown strings", () => {
    expect(isValidState(null)).toBe(false);
    expect(isValidState(undefined)).toBe(false);
    expect(isValidState("spinning")).toBe(false);
    expect(isValidState(42)).toBe(false);
  });
});

describe("inventory/transitions.isForwardTransition", () => {
  it("forward edges per the PRD state graph", () => {
    // available out-edges
    expect(isForwardTransition("available", "held")).toBe(true);
    expect(isForwardTransition("available", "blocked")).toBe(true);
    expect(isForwardTransition("available", "booked")).toBe(true);
    // held out-edges (incl. release back to available)
    expect(isForwardTransition("held", "blocked")).toBe(true);
    expect(isForwardTransition("held", "booked")).toBe(true);
    expect(isForwardTransition("held", "available")).toBe(true);
    // blocked
    expect(isForwardTransition("blocked", "booked")).toBe(true);
    expect(isForwardTransition("blocked", "available")).toBe(true);
    // booked / sold / registered chain
    expect(isForwardTransition("booked", "sold")).toBe(true);
    expect(isForwardTransition("sold", "registered")).toBe(true);
    expect(isForwardTransition("registered", "possessed")).toBe(true);
  });

  it("non-adjacent forward jumps are NOT forward", () => {
    expect(isForwardTransition("available", "sold")).toBe(false);
    expect(isForwardTransition("available", "registered")).toBe(false);
    expect(isForwardTransition("held", "sold")).toBe(false);
    expect(isForwardTransition("booked", "registered")).toBe(false);
    expect(isForwardTransition("sold", "possessed")).toBe(false);
  });

  it("backward edges are NOT forward (excl. release-to-available)", () => {
    expect(isForwardTransition("booked", "held")).toBe(false);
    expect(isForwardTransition("booked", "available")).toBe(false);
    expect(isForwardTransition("sold", "booked")).toBe(false);
    expect(isForwardTransition("registered", "sold")).toBe(false);
    expect(isForwardTransition("possessed", "registered")).toBe(false);
  });
});

describe("inventory/transitions.isOverrideRequired", () => {
  it("same-state never requires override", () => {
    for (const s of STATES) {
      expect(isOverrideRequired(s, s)).toBe(false);
    }
  });

  it("forward transitions never require override", () => {
    for (const from of STATES) {
      for (const to of STATES) {
        if (from !== to && isForwardTransition(from, to)) {
          expect(isOverrideRequired(from, to)).toBe(false);
        }
      }
    }
  });

  it("backward transitions require override", () => {
    expect(isOverrideRequired("sold", "booked")).toBe(true);
    expect(isOverrideRequired("registered", "sold")).toBe(true);
    expect(isOverrideRequired("possessed", "registered")).toBe(true);
    expect(isOverrideRequired("booked", "held")).toBe(true);
  });

  it("non-adjacent forward jumps require override", () => {
    expect(isOverrideRequired("available", "sold")).toBe(true);
    expect(isOverrideRequired("held", "sold")).toBe(true);
    expect(isOverrideRequired("blocked", "sold")).toBe(true);
  });
});

describe("inventory/transitions.assertTransitionAllowed", () => {
  it("same-state is silent no-op", () => {
    for (const s of STATES) {
      expect(() => assertTransitionAllowed(s, s, false)).not.toThrow();
      expect(() => assertTransitionAllowed(s, s, true)).not.toThrow();
    }
  });

  it("forward transitions allowed without override", () => {
    expect(() =>
      assertTransitionAllowed("available", "held", false),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("held", "booked", false),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("booked", "sold", false),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("registered", "possessed", false),
    ).not.toThrow();
  });

  it("backward without override → backward_no_override", () => {
    try {
      assertTransitionAllowed("sold", "booked", false);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalUnitTransitionError);
      expect((err as IllegalUnitTransitionError).reason).toBe(
        "backward_no_override",
      );
      expect((err as IllegalUnitTransitionError).from).toBe("sold");
      expect((err as IllegalUnitTransitionError).to).toBe("booked");
    }
  });

  it("non-adjacent forward without override → illegal_transition", () => {
    try {
      assertTransitionAllowed("available", "sold", false);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalUnitTransitionError);
      expect((err as IllegalUnitTransitionError).reason).toBe(
        "illegal_transition",
      );
    }
  });

  it("backward WITH override is allowed", () => {
    expect(() =>
      assertTransitionAllowed("sold", "booked", true),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("possessed", "available", true),
    ).not.toThrow();
  });

  it("non-adjacent forward WITH override is allowed", () => {
    expect(() =>
      assertTransitionAllowed("available", "registered", true),
    ).not.toThrow();
  });

  it("unknown state on either side → unknown_state regardless of override", () => {
    for (const has_override of [false, true]) {
      try {
        assertTransitionAllowed("spinning" as UnitState, "held", has_override);
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as IllegalUnitTransitionError).reason).toBe(
          "unknown_state",
        );
      }
      try {
        assertTransitionAllowed("held", "spinning" as UnitState, has_override);
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as IllegalUnitTransitionError).reason).toBe(
          "unknown_state",
        );
      }
    }
  });
});
