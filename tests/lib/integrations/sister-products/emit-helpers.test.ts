import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  emitEvent: vi.fn(),
}));

vi.mock("@/lib/webhooks/emit", () => ({
  emitEvent: mocks.emitEvent,
}));

import {
  emitDealStageTransitioned,
  emitLeadLost,
  emitSiteVisitScheduled,
  emitContactUpdated,
} from "@/lib/integrations/sister-products/emit-helpers";

const NOW = "2026-05-13T10:00:00.000Z";
const ORG = "00000000-0000-4000-8000-0000000000ab";
const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";

const fakeClient = { __fake: true } as unknown as Parameters<
  typeof emitDealStageTransitioned
>[0];

beforeEach(() => {
  mocks.emitEvent.mockReset();
  mocks.emitEvent.mockResolvedValue({
    total_endpoints: 0,
    matched_endpoints: 0,
    enqueued: 0,
    per_endpoint: [],
  });
});

describe("emit-helpers — happy paths", () => {
  it("emitDealStageTransitioned passes (org, kind, payload) to emitEvent", async () => {
    await emitDealStageTransitioned(fakeClient, ORG, {
      deal_id: UUID_A,
      from_stage: "eoi",
      to_stage: "token",
      transitioned_by: UUID_B,
      occurred_at: NOW,
    });
    expect(mocks.emitEvent).toHaveBeenCalledOnce();
    const call = mocks.emitEvent.mock.calls[0];
    expect(call[0]).toBe(ORG);
    expect(call[1]).toBe("deal.stage_transitioned");
    expect(call[2]).toMatchObject({
      deal_id: UUID_A,
      from_stage: "eoi",
      to_stage: "token",
    });
    expect(call[3]).toBe(fakeClient);
  });

  it("emitSiteVisitScheduled forwards the validated payload", async () => {
    await emitSiteVisitScheduled(fakeClient, ORG, {
      site_visit_id: UUID_A,
      lead_id: UUID_B,
      scheduled_at: NOW,
      occurred_at: NOW,
    });
    expect(mocks.emitEvent).toHaveBeenCalledOnce();
    expect(mocks.emitEvent.mock.calls[0][1]).toBe("site_visit.scheduled");
  });

  it("emitContactUpdated forwards the validated payload", async () => {
    await emitContactUpdated(fakeClient, ORG, {
      contact_id: UUID_A,
      changed_fields: ["primary_phone"],
      occurred_at: NOW,
    });
    expect(mocks.emitEvent.mock.calls[0][1]).toBe("contact.updated");
  });
});

describe("emit-helpers — payload validation rejects before touching emitEvent", () => {
  it("throws on invalid UUID without calling emitEvent", async () => {
    await expect(
      // @ts-expect-error — invalid UUID is the test
      emitDealStageTransitioned(fakeClient, ORG, {
        deal_id: "not-a-uuid",
        from_stage: "eoi",
        to_stage: "token",
        occurred_at: NOW,
      }),
    ).rejects.toThrow(/invalid payload for deal.stage_transitioned/);
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it("throws on missing required field (lead_id)", async () => {
    await expect(
      // @ts-expect-error — missing lead_id
      emitLeadLost(fakeClient, ORG, { occurred_at: NOW }),
    ).rejects.toThrow(/invalid payload for lead.lost/);
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it("throws on extra unexpected key (strict mode)", async () => {
    await expect(
      emitContactUpdated(fakeClient, ORG, {
        contact_id: UUID_A,
        changed_fields: ["x"],
        occurred_at: NOW,
        // @ts-expect-error — extra key is the test
        evil_extra: "boom",
      }),
    ).rejects.toThrow(/invalid payload for contact.updated/);
  });
});

describe("emit-helpers — org isolation", () => {
  it("never lets the org_id be inferred from payload — uses the arg verbatim", async () => {
    const otherOrg = "00000000-0000-4000-8000-0000000000ff";
    await emitLeadLost(fakeClient, otherOrg, {
      lead_id: UUID_A,
      reason: "test",
      occurred_at: NOW,
    });
    expect(mocks.emitEvent.mock.calls[0][0]).toBe(otherOrg);
    // payload is the validated subset — no org_id leakage from helper
    expect(mocks.emitEvent.mock.calls[0][2]).not.toHaveProperty("organization_id");
  });
});
