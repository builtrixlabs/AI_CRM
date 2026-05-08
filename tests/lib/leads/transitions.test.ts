import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  TERMINAL_STATES,
  allowedTransitions,
  isTerminal,
  assertTransitionAllowed,
  IllegalTransitionError,
  LEAD_STATES,
} from "@/lib/leads/transitions";
import type { LeadState } from "@/lib/leads/types";
import { ALLOWED_STATES } from "@/lib/nodes/states";

describe("LEAD_STATES catalog", () => {
  it("matches D-002's ALLOWED_STATES.lead (no drift)", () => {
    expect([...LEAD_STATES].sort()).toEqual([...ALLOWED_STATES.lead].sort());
  });
});

describe("TRANSITIONS graph", () => {
  it("new → contacted, qualified, lost, on_hold, junk", () => {
    expect([...TRANSITIONS.new].sort()).toEqual(
      ["contacted", "junk", "lost", "on_hold", "qualified"],
    );
  });

  it("contacted → qualified, lost, on_hold, junk", () => {
    expect([...TRANSITIONS.contacted].sort()).toEqual(
      ["junk", "lost", "on_hold", "qualified"],
    );
  });

  it("qualified → lost, on_hold, junk only (no forward to deal in V0)", () => {
    expect([...TRANSITIONS.qualified].sort()).toEqual(
      ["junk", "lost", "on_hold"],
    );
  });

  it.each(["lost", "on_hold", "junk"] as const)(
    "%s is terminal (sticky in V0)",
    (s) => {
      expect(TRANSITIONS[s]).toEqual([]);
    },
  );
});

describe("TERMINAL_STATES", () => {
  it("contains exactly lost, on_hold, junk", () => {
    expect([...TERMINAL_STATES].sort()).toEqual(["junk", "lost", "on_hold"]);
  });
});

describe("isTerminal", () => {
  it.each(["lost", "on_hold", "junk"] as const)("returns true for %s", (s) => {
    expect(isTerminal(s)).toBe(true);
  });
  it.each(["new", "contacted", "qualified"] as const)(
    "returns false for %s",
    (s) => {
      expect(isTerminal(s)).toBe(false);
    },
  );
});

describe("allowedTransitions", () => {
  it("returns the configured set for new", () => {
    expect(allowedTransitions("new").length).toBe(5);
  });
  it("returns empty for terminal states", () => {
    expect(allowedTransitions("lost")).toEqual([]);
    expect(allowedTransitions("on_hold")).toEqual([]);
    expect(allowedTransitions("junk")).toEqual([]);
  });
});

describe("assertTransitionAllowed", () => {
  it("does not throw on legal transition", () => {
    expect(() => assertTransitionAllowed("new", "contacted")).not.toThrow();
    expect(() =>
      assertTransitionAllowed("contacted", "qualified"),
    ).not.toThrow();
    expect(() => assertTransitionAllowed("qualified", "lost")).not.toThrow();
  });

  it("throws IllegalTransitionError on illegal transition", () => {
    expect(() => assertTransitionAllowed("qualified", "new")).toThrow(
      IllegalTransitionError,
    );
    expect(() => assertTransitionAllowed("lost", "new")).toThrow(
      IllegalTransitionError,
    );
    expect(() => assertTransitionAllowed("new", "new")).toThrow(
      IllegalTransitionError,
    );
  });

  it("error carries from + to", () => {
    try {
      assertTransitionAllowed("lost", "qualified");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalTransitionError);
      expect((e as IllegalTransitionError).from).toBe("lost");
      expect((e as IllegalTransitionError).to).toBe("qualified");
    }
  });
});

describe("matrix coverage — every (from, to) pair classified consistently", () => {
  it("every documented transition is acceptable; everything else throws", () => {
    for (const from of LEAD_STATES) {
      for (const to of LEAD_STATES) {
        const allowed = (TRANSITIONS[from as LeadState] as readonly LeadState[]).includes(
          to as LeadState,
        );
        if (allowed) {
          expect(() =>
            assertTransitionAllowed(from as LeadState, to as LeadState),
          ).not.toThrow();
        } else {
          expect(() =>
            assertTransitionAllowed(from as LeadState, to as LeadState),
          ).toThrow(IllegalTransitionError);
        }
      }
    }
  });
});
