import { describe, expect, it } from "vitest";
import {
  onPostSalesMilestoneUpdated,
  onPostSalesDemandLetterSent,
  onPostSalesHandoverCompleted,
} from "@/lib/events/post-sales";
import type { BuiltrixEvent } from "@/lib/events/types";

const NOW = "2026-05-13T10:00:00.000Z";
const ORG = "00000000-0000-4000-8000-0000000000ab";
const DEAL = "00000000-0000-4000-8000-000000000001";
const UNIT = "00000000-0000-4000-8000-000000000002";
const DEMAND = "00000000-0000-4000-8000-000000000003";
const fakeClient = { __fake: true } as unknown as Parameters<
  typeof onPostSalesMilestoneUpdated
>[1]["client"];

function envelope(kind: string, payload: Record<string, unknown>): BuiltrixEvent {
  return {
    event_id: "evt-abcd1234",
    organization_id: ORG,
    event_kind: kind,
    source_product: "post_sales_crm",
    ts: NOW,
    payload,
  } as BuiltrixEvent;
}

describe("onPostSalesMilestoneUpdated", () => {
  it("accepts a valid payload", async () => {
    const r = await onPostSalesMilestoneUpdated(
      envelope("post_sales.milestone_updated", {
        deal_id: DEAL,
        milestone_slug: "demand_letter_sent",
        milestone_status: "completed",
        completed_at: NOW,
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("ok");
      expect(r.node_id).toBeNull();
    }
  });

  it("rejects a malformed payload (missing deal_id)", async () => {
    const r = await onPostSalesMilestoneUpdated(
      envelope("post_sales.milestone_updated", {
        milestone_slug: "x",
        milestone_status: "completed",
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe("rejected");
      expect(r.reason).toMatch(/invalid payload/);
    }
  });

  it("rejects invalid milestone_status value", async () => {
    const r = await onPostSalesMilestoneUpdated(
      envelope("post_sales.milestone_updated", {
        deal_id: DEAL,
        milestone_slug: "x",
        milestone_status: "exploded",
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
  });
});

describe("onPostSalesDemandLetterSent", () => {
  it("accepts a valid payload", async () => {
    const r = await onPostSalesDemandLetterSent(
      envelope("post_sales.demand_letter_sent", {
        deal_id: DEAL,
        demand_letter_id: DEMAND,
        sent_at: NOW,
        amount_inr: 2500000,
        delivery_channel: "email",
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects negative amount", async () => {
    const r = await onPostSalesDemandLetterSent(
      envelope("post_sales.demand_letter_sent", {
        deal_id: DEAL,
        demand_letter_id: DEMAND,
        sent_at: NOW,
        amount_inr: -100,
        delivery_channel: "email",
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects invalid delivery_channel", async () => {
    const r = await onPostSalesDemandLetterSent(
      envelope("post_sales.demand_letter_sent", {
        deal_id: DEAL,
        demand_letter_id: DEMAND,
        sent_at: NOW,
        amount_inr: 100,
        delivery_channel: "pigeon",
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
  });
});

describe("onPostSalesHandoverCompleted", () => {
  it("accepts a valid payload", async () => {
    const r = await onPostSalesHandoverCompleted(
      envelope("post_sales.handover_completed", {
        deal_id: DEAL,
        unit_id: UNIT,
        handover_at: NOW,
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects non-ISO handover_at", async () => {
    const r = await onPostSalesHandoverCompleted(
      envelope("post_sales.handover_completed", {
        deal_id: DEAL,
        unit_id: UNIT,
        handover_at: "yesterday",
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
  });
});
