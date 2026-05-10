import { describe, expect, it } from "vitest";
import {
  IllegalUnitTransitionError,
  STATUS_ORDER,
  assertTransitionAllowed,
  isForwardTransition,
  isOverrideRequired,
} from "@/lib/catalog/transitions";
import type { UnitStatus } from "@/lib/catalog/queries";

const STATES: UnitStatus[] = [...STATUS_ORDER];

describe("catalog/transitions.isForwardTransition", () => {
  it("same-state is forward (allowed no-op)", () => {
    for (const s of STATES) expect(isForwardTransition(s, s)).toBe(true);
  });

  it("strictly forward pairs are forward", () => {
    expect(isForwardTransition("available", "held")).toBe(true);
    expect(isForwardTransition("available", "booked")).toBe(true);
    expect(isForwardTransition("available", "sold")).toBe(true);
    expect(isForwardTransition("held", "booked")).toBe(true);
    expect(isForwardTransition("held", "sold")).toBe(true);
    expect(isForwardTransition("booked", "sold")).toBe(true);
  });

  it("strictly backward pairs are NOT forward", () => {
    expect(isForwardTransition("sold", "booked")).toBe(false);
    expect(isForwardTransition("sold", "held")).toBe(false);
    expect(isForwardTransition("sold", "available")).toBe(false);
    expect(isForwardTransition("booked", "held")).toBe(false);
    expect(isForwardTransition("booked", "available")).toBe(false);
    expect(isForwardTransition("held", "available")).toBe(false);
  });
});

describe("catalog/transitions.isOverrideRequired", () => {
  it("forward never requires override", () => {
    for (const from of STATES) {
      for (const to of STATES) {
        if (isForwardTransition(from, to)) {
          expect(isOverrideRequired(from, to)).toBe(false);
        }
      }
    }
  });

  it("backward always requires override", () => {
    expect(isOverrideRequired("sold", "available")).toBe(true);
    expect(isOverrideRequired("sold", "held")).toBe(true);
    expect(isOverrideRequired("sold", "booked")).toBe(true);
    expect(isOverrideRequired("booked", "held")).toBe(true);
    expect(isOverrideRequired("booked", "available")).toBe(true);
    expect(isOverrideRequired("held", "available")).toBe(true);
  });
});

describe("catalog/transitions.assertTransitionAllowed", () => {
  it("same-state always allowed (no override needed)", () => {
    for (const s of STATES) {
      expect(() => assertTransitionAllowed(s, s, false)).not.toThrow();
    }
  });

  it("forward allowed without override", () => {
    expect(() =>
      assertTransitionAllowed("available", "held", false)
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("held", "booked", false)
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("booked", "sold", false)
    ).not.toThrow();
  });

  it("backward without override throws backward_no_override", () => {
    try {
      assertTransitionAllowed("booked", "available", false);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalUnitTransitionError);
      if (e instanceof IllegalUnitTransitionError) {
        expect(e.reason).toBe("backward_no_override");
        expect(e.from).toBe("booked");
        expect(e.to).toBe("available");
      }
    }
  });

  it("backward with override is allowed", () => {
    expect(() =>
      assertTransitionAllowed("sold", "booked", true)
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("booked", "available", true)
    ).not.toThrow();
  });

  it("unknown state throws unknown_state", () => {
    try {
      assertTransitionAllowed("available", "unknown" as UnitStatus, true);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalUnitTransitionError);
      if (e instanceof IllegalUnitTransitionError) {
        expect(e.reason).toBe("unknown_state");
      }
    }
  });
});
