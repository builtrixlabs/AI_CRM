import { describe, expect, it } from "vitest";
import {
  ALLOWED_STATES,
  validateState,
  isTerminalState,
} from "@/lib/nodes/states";

describe("ALLOWED_STATES — coverage of all 10 node types", () => {
  it("declares states for stateful types and empty for stateless", () => {
    expect(ALLOWED_STATES.lead.length).toBeGreaterThan(0);
    expect(ALLOWED_STATES.deal.length).toBeGreaterThan(0);
    expect(ALLOWED_STATES.property.length).toBeGreaterThan(0);
    expect(ALLOWED_STATES.unit.length).toBeGreaterThan(0);
    expect(ALLOWED_STATES.site_visit.length).toBeGreaterThan(0);
    expect(ALLOWED_STATES.document.length).toBeGreaterThan(0);
    // stateless
    expect(ALLOWED_STATES.contact.length).toBe(0);
    expect(ALLOWED_STATES.call.length).toBe(0);
    expect(ALLOWED_STATES.activity.length).toBe(0);
    expect(ALLOWED_STATES.note.length).toBe(0);
  });
});

describe("validateState", () => {
  it("accepts a valid (type, state) pair", () => {
    expect(validateState("lead", "qualified")).toBe(true);
    expect(validateState("deal", "negotiation")).toBe(true);
    expect(validateState("site_visit", "completed")).toBe(true);
  });

  it("rejects when state belongs to a different type", () => {
    expect(validateState("lead", "booked")).toBe(false);   // booked is deal
    expect(validateState("contact", "qualified")).toBe(false);
  });

  it("treats undefined/null as valid for stateless types", () => {
    expect(validateState("contact", null)).toBe(true);
    expect(validateState("contact", undefined)).toBe(true);
    expect(validateState("call", null)).toBe(true);
  });

  it("treats undefined/null as INVALID for stateful types (must pick one)", () => {
    expect(validateState("lead", null)).toBe(false);
    expect(validateState("deal", undefined)).toBe(false);
  });

  it("rejects unknown states even in stateful types", () => {
    expect(validateState("lead", "spinning")).toBe(false);
  });
});

describe("isTerminalState", () => {
  it("recognises lead/deal terminal states", () => {
    expect(isTerminalState("lead", "lost")).toBe(true);
    expect(isTerminalState("lead", "junk")).toBe(true);
    expect(isTerminalState("lead", "on_hold")).toBe(true);
    expect(isTerminalState("deal", "booked")).toBe(true);
    expect(isTerminalState("deal", "lost")).toBe(true);
  });

  it("returns false for non-terminal states", () => {
    expect(isTerminalState("lead", "qualified")).toBe(false);
    expect(isTerminalState("deal", "negotiation")).toBe(false);
  });

  it("returns false for stateless types regardless of input", () => {
    expect(isTerminalState("contact", "anything")).toBe(false);
  });
});

// D-602 (V6 Phase 1) — amends baseline/110 §III: the site_visit lifecycle
// grows from 4 to 7 states. Pre-V6 rows still validate (strict subset).
describe("site_visit lifecycle — D-602 7-state amendment", () => {
  it("admits the new V6 states draft / in_progress / cancelled", () => {
    expect(validateState("site_visit", "draft")).toBe(true);
    expect(validateState("site_visit", "in_progress")).toBe(true);
    expect(validateState("site_visit", "cancelled")).toBe(true);
  });

  it("still admits every pre-V6 state", () => {
    for (const s of ["scheduled", "confirmed", "completed", "no_show"]) {
      expect(validateState("site_visit", s)).toBe(true);
    }
  });

  it("treats cancelled as terminal alongside completed and no_show", () => {
    expect(isTerminalState("site_visit", "cancelled")).toBe(true);
    expect(isTerminalState("site_visit", "completed")).toBe(true);
    expect(isTerminalState("site_visit", "no_show")).toBe(true);
    expect(isTerminalState("site_visit", "scheduled")).toBe(false);
    expect(isTerminalState("site_visit", "in_progress")).toBe(false);
  });

  it("rejects states from other node types", () => {
    expect(validateState("site_visit", "booked")).toBe(false);
    expect(validateState("site_visit", "qualified")).toBe(false);
  });
});
