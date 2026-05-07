import { describe, expect, it } from "vitest";
import { nodeSchemaFor } from "@/lib/nodes/schemas";

// Valid UUID v4 strings (third group starts with 4, fourth group with 8|9|a|b)
const UUID = "11111111-2222-4333-8444-555555555555";
const UUID2 = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const valid = {
  lead: { phone: "+919876543210", source: "walkin" },
  contact: { phone: "+919876543210" },
  deal: { lead_id: UUID, expected_value: 1500000, currency: "INR" },
  property: { name: "Lodha Park", city: "Mumbai" },
  unit: { property_id: UUID, unit_no: "A-1404", bhk: 3, price: 18000000 },
  site_visit: { lead_id: UUID, scheduled_at: "2026-06-01T10:00:00Z" },
  call: { direction: "inbound", duration_seconds: 720 },
  activity: { subject_node_id: UUID, kind: "whatsapp", summary: "asked for floor plan" },
  document: {
    kind: "offer_letter",
    signed_url: "https://storage.supabase.co/signed/...",
    version: 1,
  },
  note: { body: "Internal note: Priya is high-intent" },
} as const;

describe("nodeSchemaFor — lead", () => {
  it("accepts a valid lead", () => {
    expect(nodeSchemaFor("lead").safeParse(valid.lead).success).toBe(true);
  });
  it("rejects missing phone", () => {
    const { source } = valid.lead;
    expect(nodeSchemaFor("lead").safeParse({ source }).success).toBe(false);
  });
  it("rejects intent_score outside [0..100]", () => {
    expect(
      nodeSchemaFor("lead").safeParse({ ...valid.lead, intent_score: 150 })
        .success
    ).toBe(false);
    expect(
      nodeSchemaFor("lead").safeParse({ ...valid.lead, intent_score: -1 })
        .success
    ).toBe(false);
  });
  it("rejects unknown top-level keys (strict)", () => {
    expect(
      nodeSchemaFor("lead").safeParse({ ...valid.lead, hacker_field: 1 })
        .success
    ).toBe(false);
  });
  it("accepts a custom subkey", () => {
    expect(
      nodeSchemaFor("lead").safeParse({
        ...valid.lead,
        custom: { budget_range: "1.5-2Cr" },
      }).success
    ).toBe(true);
  });
});

describe("nodeSchemaFor — contact", () => {
  it("accepts phone only", () => {
    expect(nodeSchemaFor("contact").safeParse(valid.contact).success).toBe(true);
  });
  it("accepts email only", () => {
    expect(
      nodeSchemaFor("contact").safeParse({ email: "p@example.com" }).success
    ).toBe(true);
  });
  it("rejects when neither phone nor email is present", () => {
    expect(nodeSchemaFor("contact").safeParse({ name: "Priya" }).success).toBe(
      false
    );
  });
});

describe("nodeSchemaFor — deal", () => {
  it("accepts a valid deal", () => {
    expect(nodeSchemaFor("deal").safeParse(valid.deal).success).toBe(true);
  });
  it("requires lead_id as UUID", () => {
    expect(
      nodeSchemaFor("deal").safeParse({ ...valid.deal, lead_id: "not-a-uuid" })
        .success
    ).toBe(false);
  });
  it("rejects negative expected_value", () => {
    expect(
      nodeSchemaFor("deal").safeParse({ ...valid.deal, expected_value: -1 })
        .success
    ).toBe(false);
  });
  it("defaults currency to INR when omitted", () => {
    const r = nodeSchemaFor("deal").safeParse({
      lead_id: UUID,
      expected_value: 1000,
    });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as { currency: string }).currency).toBe("INR");
  });
});

describe("nodeSchemaFor — property + unit", () => {
  it("property accepts valid", () => {
    expect(nodeSchemaFor("property").safeParse(valid.property).success).toBe(true);
  });
  it("property requires name", () => {
    expect(
      nodeSchemaFor("property").safeParse({ city: "Mumbai" }).success
    ).toBe(false);
  });
  it("property requires city", () => {
    expect(
      nodeSchemaFor("property").safeParse({ name: "Park" }).success
    ).toBe(false);
  });
  it("unit accepts valid", () => {
    expect(nodeSchemaFor("unit").safeParse(valid.unit).success).toBe(true);
  });
  it("unit rejects bhk outside reasonable bounds", () => {
    expect(
      nodeSchemaFor("unit").safeParse({ ...valid.unit, bhk: 0 }).success
    ).toBe(false);
    expect(
      nodeSchemaFor("unit").safeParse({ ...valid.unit, bhk: 11 }).success
    ).toBe(false);
  });
});

describe("nodeSchemaFor — site_visit + call", () => {
  it("site_visit accepts valid", () => {
    expect(
      nodeSchemaFor("site_visit").safeParse(valid.site_visit).success
    ).toBe(true);
  });
  it("site_visit rejects non-ISO scheduled_at", () => {
    expect(
      nodeSchemaFor("site_visit").safeParse({
        lead_id: UUID,
        scheduled_at: "tomorrow morning",
      }).success
    ).toBe(false);
  });
  it("call accepts valid", () => {
    expect(nodeSchemaFor("call").safeParse(valid.call).success).toBe(true);
  });
  it("call rejects unknown direction", () => {
    expect(
      nodeSchemaFor("call").safeParse({ ...valid.call, direction: "sideways" })
        .success
    ).toBe(false);
  });
  it("call rejects negative duration_seconds", () => {
    expect(
      nodeSchemaFor("call").safeParse({ ...valid.call, duration_seconds: -10 })
        .success
    ).toBe(false);
  });
});

describe("nodeSchemaFor — activity / document / note", () => {
  it("activity accepts valid", () => {
    expect(nodeSchemaFor("activity").safeParse(valid.activity).success).toBe(true);
  });
  it("activity rejects unknown kind", () => {
    expect(
      nodeSchemaFor("activity").safeParse({ ...valid.activity, kind: "telegram" })
        .success
    ).toBe(false);
  });
  it("document accepts valid", () => {
    expect(nodeSchemaFor("document").safeParse(valid.document).success).toBe(true);
  });
  it("document requires version >= 1", () => {
    expect(
      nodeSchemaFor("document").safeParse({ ...valid.document, version: 0 })
        .success
    ).toBe(false);
  });
  it("note accepts non-empty body", () => {
    expect(nodeSchemaFor("note").safeParse(valid.note).success).toBe(true);
  });
  it("note rejects empty body", () => {
    expect(nodeSchemaFor("note").safeParse({ body: "" }).success).toBe(false);
  });
});

describe("nodeSchemaFor — resolver semantics", () => {
  it("returns a working schema for each of the 10 node types", () => {
    const types = [
      "lead",
      "contact",
      "deal",
      "property",
      "unit",
      "site_visit",
      "call",
      "activity",
      "document",
      "note",
    ] as const;
    for (const t of types) {
      const schema = nodeSchemaFor(t);
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe("function");
    }
  });
  it("throws for an invalid node_type", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeSchemaFor("foo" as any)
    ).toThrow();
  });
});
