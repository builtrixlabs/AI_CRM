import { describe, expect, it } from "vitest";
import {
  mihLeadInboundSchema,
  MIH_SOURCE_CHANNELS,
} from "@/lib/integrations/mih/schema";

const ORG = "11111111-2222-4333-8444-555555555555";

function validPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organization_id: ORG,
    external_id: "mih-ext-001",
    name: "Asha Rao",
    phone_e164: "+919876543210",
    source: "meta_lead_ads",
    source_channel: "paid_social",
    source_received_at: "2026-05-14T10:00:00.000Z",
    preference: { bhk: 3, budget_band: "1.5-2Cr" },
    raw_payload: { meta: { form_id: "abc" } },
    ...over,
  };
}

function without(key: string): Record<string, unknown> {
  const p = validPayload();
  delete p[key];
  return p;
}

describe("mihLeadInboundSchema — baseline 122 §2", () => {
  it("accepts a complete valid payload", () => {
    expect(mihLeadInboundSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("accepts an empty preference object", () => {
    expect(
      mihLeadInboundSchema.safeParse(validPayload({ preference: {} })).success,
    ).toBe(true);
  });

  it("rejects a missing external_id", () => {
    expect(mihLeadInboundSchema.safeParse(without("external_id")).success).toBe(
      false,
    );
  });

  it("rejects a missing raw_payload", () => {
    expect(mihLeadInboundSchema.safeParse(without("raw_payload")).success).toBe(
      false,
    );
  });

  it("rejects a missing preference (baseline 122 §2 — required object)", () => {
    expect(mihLeadInboundSchema.safeParse(without("preference")).success).toBe(
      false,
    );
  });

  it("rejects a source_channel outside the closed enum", () => {
    expect(
      mihLeadInboundSchema.safeParse(
        validPayload({ source_channel: "carrier_pigeon" }),
      ).success,
    ).toBe(false);
  });

  it("rejects a non-uuid organization_id", () => {
    expect(
      mihLeadInboundSchema.safeParse(validPayload({ organization_id: "nope" }))
        .success,
    ).toBe(false);
  });

  it("rejects a non-ISO source_received_at", () => {
    expect(
      mihLeadInboundSchema.safeParse(
        validPayload({ source_received_at: "yesterday" }),
      ).success,
    ).toBe(false);
  });

  it("passes through unknown top-level keys (baseline 122 §10 additive)", () => {
    const r = mihLeadInboundSchema.safeParse(
      validPayload({ future_field: "x" }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts every source_channel enum value", () => {
    for (const ch of MIH_SOURCE_CHANNELS) {
      expect(
        mihLeadInboundSchema.safeParse(validPayload({ source_channel: ch }))
          .success,
      ).toBe(true);
    }
  });
});
