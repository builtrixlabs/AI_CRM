import { describe, expect, it } from "vitest";
import {
  SISTER_PRODUCT_EVENT_KINDS,
  isSisterProductEventKind,
  PAYLOAD_SCHEMAS,
  type SisterProductEventKind,
} from "@/lib/integrations/sister-products/event-kinds";

const NOW = "2026-05-13T10:00:00.000Z";
const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";
const UUID_C = "00000000-0000-4000-8000-000000000003";

const HAPPY: Record<SisterProductEventKind, Record<string, unknown>> = {
  "deal.created": {
    deal_id: UUID_A,
    contact_id: UUID_B,
    source: "webform",
    occurred_at: NOW,
  },
  "deal.qualified": {
    deal_id: UUID_A,
    qualified_by: UUID_B,
    bant_score: 72,
    occurred_at: NOW,
  },
  "deal.booked": {
    deal_id: UUID_A,
    unit_id: UUID_C,
    booking_amount_inr: 15000000,
    occurred_at: NOW,
  },
  "deal.lost": {
    deal_id: UUID_A,
    reason: "budget_mismatch",
    occurred_at: NOW,
  },
  "deal.stage_transitioned": {
    deal_id: UUID_A,
    from_stage: "eoi",
    to_stage: "token",
    transitioned_by: UUID_B,
    occurred_at: NOW,
  },
  "lead.created": {
    lead_id: UUID_A,
    source: "meta_lead_ads",
    workspace_id: UUID_C,
    occurred_at: NOW,
  },
  "lead.qualified": {
    lead_id: UUID_A,
    qualified_by: UUID_B,
    occurred_at: NOW,
  },
  "lead.lost": {
    lead_id: UUID_A,
    reason: "wrong_number",
    occurred_at: NOW,
  },
  "site_visit.scheduled": {
    site_visit_id: UUID_A,
    lead_id: UUID_B,
    scheduled_at: NOW,
    occurred_at: NOW,
  },
  "site_visit.completed": {
    site_visit_id: UUID_A,
    deal_id: UUID_B,
    occurred_at: NOW,
  },
  "site_visit.cancelled": {
    site_visit_id: UUID_A,
    reason: "rain",
    occurred_at: NOW,
  },
  "contact.created": {
    contact_id: UUID_A,
    primary_phone: "+91-9999999999",
    primary_email: "buyer@example.com",
    occurred_at: NOW,
  },
  "contact.updated": {
    contact_id: UUID_A,
    changed_fields: ["primary_phone", "preferred_language"],
    occurred_at: NOW,
  },
};

describe("isSisterProductEventKind", () => {
  it("accepts every kind in the canonical enum", () => {
    for (const kind of SISTER_PRODUCT_EVENT_KINDS) {
      expect(isSisterProductEventKind(kind)).toBe(true);
    }
  });

  it("rejects unknown kinds (no fuzzy / prefix matching)", () => {
    expect(isSisterProductEventKind("post_sales.milestone_updated")).toBe(false);
    expect(isSisterProductEventKind("deal")).toBe(false);
    expect(isSisterProductEventKind("")).toBe(false);
  });
});

describe("PAYLOAD_SCHEMAS — happy path", () => {
  it("has a schema entry for every kind in the canonical enum", () => {
    for (const kind of SISTER_PRODUCT_EVENT_KINDS) {
      expect(PAYLOAD_SCHEMAS[kind]).toBeDefined();
    }
  });

  for (const kind of SISTER_PRODUCT_EVENT_KINDS) {
    it(`accepts a representative payload for ${kind}`, () => {
      const schema = PAYLOAD_SCHEMAS[kind];
      const result = schema.safeParse(HAPPY[kind]);
      if (!result.success) {
        // surface the zod error so the failure is debuggable
        throw new Error(
          `${kind} rejected its happy payload: ${JSON.stringify(result.error.issues)}`,
        );
      }
      expect(result.success).toBe(true);
    });
  }
});

describe("PAYLOAD_SCHEMAS — rejection", () => {
  it("rejects deal.created without deal_id", () => {
    const r = PAYLOAD_SCHEMAS["deal.created"].safeParse({
      occurred_at: NOW,
    });
    expect(r.success).toBe(false);
  });

  it("rejects deal.created with a non-UUID deal_id", () => {
    const r = PAYLOAD_SCHEMAS["deal.created"].safeParse({
      deal_id: "not-a-uuid",
      occurred_at: NOW,
    });
    expect(r.success).toBe(false);
  });

  it("rejects deal.stage_transitioned with empty from_stage", () => {
    const r = PAYLOAD_SCHEMAS["deal.stage_transitioned"].safeParse({
      deal_id: UUID_A,
      from_stage: "",
      to_stage: "token",
      occurred_at: NOW,
    });
    expect(r.success).toBe(false);
  });

  it("rejects deal.qualified with bant_score > 100", () => {
    const r = PAYLOAD_SCHEMAS["deal.qualified"].safeParse({
      deal_id: UUID_A,
      bant_score: 150,
      occurred_at: NOW,
    });
    expect(r.success).toBe(false);
  });

  it("rejects contact.updated with empty changed_fields array", () => {
    const r = PAYLOAD_SCHEMAS["contact.updated"].safeParse({
      contact_id: UUID_A,
      changed_fields: [],
      occurred_at: NOW,
    });
    expect(r.success).toBe(false);
  });

  it("rejects extra keys not in the schema (strict mode)", () => {
    const r = PAYLOAD_SCHEMAS["deal.created"].safeParse({
      deal_id: UUID_A,
      occurred_at: NOW,
      extra_evil_key: "should fail",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed occurred_at (non-ISO)", () => {
    const r = PAYLOAD_SCHEMAS["lead.created"].safeParse({
      lead_id: UUID_A,
      occurred_at: "not a datetime",
    });
    expect(r.success).toBe(false);
  });
});
