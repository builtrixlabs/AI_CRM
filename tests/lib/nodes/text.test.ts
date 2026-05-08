import { describe, expect, it } from "vitest";
import { maskPii, textOfRecord } from "@/lib/nodes/text";

describe("maskPii", () => {
  it("masks Indian-format phone numbers", () => {
    expect(maskPii("Call me at +91-9876543210")).toContain("[phone]");
    expect(maskPii("9876543210")).toContain("[phone]");
    expect(maskPii("+91 98765 43210")).toContain("[phone]");
  });

  it("masks emails", () => {
    expect(maskPii("Email: priya@example.com")).toContain("[email]");
    expect(maskPii("priya.s+tag@x.co.in")).toContain("[email]");
  });

  it("masks combined phone + email", () => {
    const out = maskPii("Reach Priya at +91-9876543210 or priya@example.com");
    expect(out).toContain("[phone]");
    expect(out).toContain("[email]");
  });

  it("leaves non-PII text alone", () => {
    const t = "3 BHK in Whitefield, Bangalore — budget ₹1.8 Cr";
    expect(maskPii(t)).toBe(t);
  });

  it("does NOT match short numeric strings (years, scores, ids)", () => {
    expect(maskPii("score 87")).toBe("score 87");
    expect(maskPii("year 2026")).toBe("year 2026");
  });
});

describe("textOfRecord — lead", () => {
  it("includes type, state, masked label, and only allowlisted data keys", () => {
    const out = textOfRecord({
      node_type: "lead",
      label: "Priya Sharma",
      state: "qualified",
      data: {
        source: "magicbricks",
        intent_score: 87,
        city: "Bangalore",
        // PII fields that MUST be dropped:
        phone: "+91-9876543210",
        email: "priya@example.com",
        notes: "called twice, very interested",
      },
    });
    expect(out).toContain("type: lead");
    expect(out).toContain("state: qualified");
    expect(out).toContain("label: Priya Sharma");
    expect(out).toContain("source: magicbricks");
    expect(out).toContain("intent_score: 87");
    expect(out).toContain("city: Bangalore");
    expect(out).not.toContain("9876543210");
    expect(out).not.toContain("priya@example.com");
    expect(out).not.toContain("notes:");
  });

  it("masks PII inside the label itself", () => {
    const out = textOfRecord({
      node_type: "lead",
      label: "+91-9876543210",
      data: { source: "walkin" },
    });
    expect(out).toContain("label: [phone]");
    expect(out).not.toContain("9876543210");
  });

  it("skips empty / null values", () => {
    const out = textOfRecord({
      node_type: "lead",
      label: "X",
      data: { source: "walkin", intent_score: null, city: "" },
    });
    expect(out).toContain("source: walkin");
    expect(out).not.toContain("intent_score:");
    expect(out).not.toContain("city:");
  });

  it("handles null data", () => {
    const out = textOfRecord({
      node_type: "lead",
      label: "X",
      data: null,
      state: "new",
    });
    expect(out).toContain("type: lead");
    expect(out).toContain("state: new");
  });

  it("ignores arrays + nested objects (V0 flat embedding source)", () => {
    const out = textOfRecord({
      node_type: "lead",
      label: "X",
      data: {
        source: "walkin",
        meta: { foo: "bar" },
        tags: ["a", "b"],
      },
    });
    expect(out).toContain("source: walkin");
    expect(out).not.toContain("foo");
    expect(out).not.toContain("[a, b]");
  });
});

describe("textOfRecord — other types", () => {
  it("uses the right allowlist for deal", () => {
    const out = textOfRecord({
      node_type: "deal",
      label: "Tower B · Unit 1404",
      state: "negotiation",
      data: {
        stage_label: "Negotiation",
        city: "Bangalore",
        unit_type: "3BHK",
        owner_email: "rep@example.com", // not in deal allowlist
      },
    });
    expect(out).toContain("stage_label: Negotiation");
    expect(out).toContain("city: Bangalore");
    expect(out).not.toContain("owner_email");
    expect(out).not.toContain("rep@example.com");
  });

  it("includes boolean values in the embedding source", () => {
    const out = textOfRecord({
      node_type: "document",
      label: "Agreement.pdf",
      data: { doc_type: "agreement", verified: true },
    });
    expect(out).toContain("doc_type: agreement");
    expect(out).toContain("verified: true");
  });

  it("note has no allowlisted keys (label only)", () => {
    const out = textOfRecord({
      node_type: "note",
      label: "Followup tomorrow",
      data: { body: "Call him at +91-9999999999", author: "Me" },
    });
    expect(out).toContain("label: Followup tomorrow");
    expect(out).not.toContain("body:");
    expect(out).not.toContain("9999999999");
  });

  it("unknown node_type gets an empty allowlist (label only)", () => {
    const out = textOfRecord({
      node_type: "future_type" as unknown as string,
      label: "X",
      data: { foo: "bar" },
    });
    expect(out).toContain("label: X");
    expect(out).not.toContain("foo");
  });
});
