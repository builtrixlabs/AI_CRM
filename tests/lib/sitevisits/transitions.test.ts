import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  TERMINAL_STATES,
  isTerminal,
  allowedTransitions,
  assertTransitionAllowed,
  IllegalTransitionError,
} from "@/lib/sitevisits/transitions";

describe("site_visit transitions", () => {
  it("scheduled is non-terminal", () => {
    expect(isTerminal("scheduled")).toBe(false);
  });
  it("completed and no_show are terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("no_show")).toBe(true);
  });

  it("scheduled → confirmed/completed/no_show all allowed", () => {
    for (const target of ["confirmed", "completed", "no_show"] as const) {
      expect(() => assertTransitionAllowed("scheduled", target)).not.toThrow();
    }
  });

  it("confirmed → completed/no_show allowed; not back to scheduled", () => {
    expect(() => assertTransitionAllowed("confirmed", "completed")).not.toThrow();
    expect(() => assertTransitionAllowed("confirmed", "no_show")).not.toThrow();
    expect(() => assertTransitionAllowed("confirmed", "scheduled")).toThrow(
      IllegalTransitionError
    );
  });

  it("completed/no_show are sticky", () => {
    expect(allowedTransitions("completed")).toEqual([]);
    expect(allowedTransitions("no_show")).toEqual([]);
    expect(() => assertTransitionAllowed("completed", "scheduled")).toThrow();
  });

  it("matches the constant table", () => {
    expect(TRANSITIONS.scheduled).toEqual(["confirmed", "completed", "no_show"]);
    expect(TERMINAL_STATES.has("completed")).toBe(true);
    expect(TERMINAL_STATES.has("scheduled")).toBe(false);
  });
});
