import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  TERMINAL_STATES,
  isTerminal,
  allowedTransitions,
  assertTransitionAllowed,
  IllegalTransitionError,
} from "@/lib/sitevisits/transitions";

// D-602 (V6 Phase 1) — 7-state workflow, amending baseline/110 §III:
//   draft -> scheduled -> confirmed -> in_progress -> completed
//          -> cancelled -> no_show
describe("site_visit transitions — D-602 7-state machine", () => {
  it("draft / scheduled / confirmed / in_progress are non-terminal", () => {
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("scheduled")).toBe(false);
    expect(isTerminal("confirmed")).toBe(false);
    expect(isTerminal("in_progress")).toBe(false);
  });

  it("completed / cancelled / no_show are terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("no_show")).toBe(true);
    expect(TERMINAL_STATES.has("cancelled")).toBe(true);
  });

  it("draft → scheduled | cancelled (not completed)", () => {
    expect(() => assertTransitionAllowed("draft", "scheduled")).not.toThrow();
    expect(() => assertTransitionAllowed("draft", "cancelled")).not.toThrow();
    expect(() => assertTransitionAllowed("draft", "completed")).toThrow(
      IllegalTransitionError,
    );
  });

  it("scheduled → confirmed | in_progress | completed | cancelled | no_show", () => {
    for (const t of [
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
      "no_show",
    ] as const) {
      expect(() => assertTransitionAllowed("scheduled", t)).not.toThrow();
    }
    expect(() => assertTransitionAllowed("scheduled", "draft")).toThrow(
      IllegalTransitionError,
    );
  });

  it("confirmed cannot regress to scheduled or draft", () => {
    expect(() =>
      assertTransitionAllowed("confirmed", "in_progress"),
    ).not.toThrow();
    expect(() => assertTransitionAllowed("confirmed", "scheduled")).toThrow();
    expect(() => assertTransitionAllowed("confirmed", "draft")).toThrow();
  });

  it("in_progress → completed | cancelled only (not no_show)", () => {
    expect(() =>
      assertTransitionAllowed("in_progress", "completed"),
    ).not.toThrow();
    expect(() =>
      assertTransitionAllowed("in_progress", "cancelled"),
    ).not.toThrow();
    expect(() => assertTransitionAllowed("in_progress", "no_show")).toThrow();
  });

  it("terminal states are sticky", () => {
    for (const t of ["completed", "cancelled", "no_show"] as const) {
      expect(allowedTransitions(t)).toEqual([]);
      expect(() => assertTransitionAllowed(t, "scheduled")).toThrow();
    }
  });

  it("matches the constant table", () => {
    expect(TRANSITIONS.draft).toEqual(["scheduled", "cancelled"]);
    expect(TRANSITIONS.scheduled).toEqual([
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
      "no_show",
    ]);
    expect(TRANSITIONS.confirmed).toEqual([
      "in_progress",
      "completed",
      "cancelled",
      "no_show",
    ]);
    expect(TRANSITIONS.in_progress).toEqual(["completed", "cancelled"]);
    expect(TERMINAL_STATES.has("completed")).toBe(true);
    expect(TERMINAL_STATES.has("scheduled")).toBe(false);
  });
});
