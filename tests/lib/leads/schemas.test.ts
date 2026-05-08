import { describe, expect, it } from "vitest";
import {
  createLeadInputSchema,
  updateLeadInputSchema,
  transitionInputSchema,
} from "@/lib/leads/schemas";

describe("createLeadInputSchema", () => {
  it("accepts a valid payload", () => {
    expect(
      createLeadInputSchema.safeParse({
        phone: "+91-9876543210",
        source: "magicbricks",
        email: "p@example.com",
        notes: "first call",
      }).success,
    ).toBe(true);
  });

  it("accepts a minimal payload (phone + source only)", () => {
    expect(
      createLeadInputSchema.safeParse({
        phone: "+919876543210",
        source: "walkin",
      }).success,
    ).toBe(true);
  });

  it("rejects missing phone", () => {
    expect(
      createLeadInputSchema.safeParse({ source: "walkin" }).success,
    ).toBe(false);
  });

  it("rejects unknown source", () => {
    expect(
      createLeadInputSchema.safeParse({
        phone: "+91-9876543210",
        source: "linkedin",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(
      createLeadInputSchema.safeParse({
        phone: "+91-9876543210",
        source: "walkin",
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });
});

describe("updateLeadInputSchema", () => {
  it("accepts a partial payload", () => {
    expect(updateLeadInputSchema.safeParse({ notes: "x" }).success).toBe(true);
  });

  it("rejects unknown source on edit", () => {
    expect(
      updateLeadInputSchema.safeParse({ source: "linkedin" }).success,
    ).toBe(false);
  });

  it("accepts empty payload (no-op edit)", () => {
    expect(updateLeadInputSchema.safeParse({}).success).toBe(true);
  });
});

describe("transitionInputSchema", () => {
  it("accepts a forward transition (no reason)", () => {
    expect(
      transitionInputSchema.safeParse({
        lead_id: "11111111-2222-4333-8444-555555555555",
        target_state: "contacted",
      }).success,
    ).toBe(true);
  });

  it("requires reason for terminal transitions", () => {
    const noReason = transitionInputSchema.safeParse({
      lead_id: "11111111-2222-4333-8444-555555555555",
      target_state: "lost",
    });
    expect(noReason.success).toBe(false);
  });

  it("accepts terminal transition with non-empty reason", () => {
    expect(
      transitionInputSchema.safeParse({
        lead_id: "11111111-2222-4333-8444-555555555555",
        target_state: "lost",
        reason: "duplicate",
      }).success,
    ).toBe(true);
  });

  it("rejects empty reason for terminal", () => {
    expect(
      transitionInputSchema.safeParse({
        lead_id: "11111111-2222-4333-8444-555555555555",
        target_state: "junk",
        reason: "   ",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed lead_id", () => {
    expect(
      transitionInputSchema.safeParse({
        lead_id: "not-a-uuid",
        target_state: "contacted",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown target_state", () => {
    expect(
      transitionInputSchema.safeParse({
        lead_id: "11111111-2222-4333-8444-555555555555",
        target_state: "negotiation",
      }).success,
    ).toBe(false);
  });
});
