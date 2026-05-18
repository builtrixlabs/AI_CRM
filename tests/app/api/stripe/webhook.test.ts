import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyWebhookSignature: vi.fn(),
  handleSubscriptionCreated: vi.fn().mockResolvedValue(undefined),
  handleSubscriptionUpdated: vi.fn().mockResolvedValue(undefined),
  handleSubscriptionDeleted: vi.fn().mockResolvedValue(undefined),
  handleInvoicePaid: vi.fn().mockResolvedValue(undefined),
  handleInvoicePaymentFailed: vi.fn().mockResolvedValue(undefined),
  logInsert: vi.fn().mockResolvedValue({ error: null }),
  logExistingRef: { current: null as { event_id: string } | null },
}));

vi.mock("@/lib/billing/stripe", () => ({
  verifyWebhookSignature: mocks.verifyWebhookSignature,
}));

vi.mock("@/lib/billing/webhook-handlers", () => ({
  handleSubscriptionCreated: mocks.handleSubscriptionCreated,
  handleSubscriptionUpdated: mocks.handleSubscriptionUpdated,
  handleSubscriptionDeleted: mocks.handleSubscriptionDeleted,
  handleInvoicePaid: mocks.handleInvoicePaid,
  handleInvoicePaymentFailed: mocks.handleInvoicePaymentFailed,
}));

vi.mock("@/lib/platform/api-audit", () => ({
  recordApiAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "stripe_event_log") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: mocks.logExistingRef.current,
                  error: null,
                }),
            }),
          }),
          insert: mocks.logInsert,
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  }),
}));

import { POST } from "@/app/api/stripe/webhook/route";

beforeEach(() => {
  mocks.verifyWebhookSignature.mockReset();
  // mockReset clears both calls and implementations; re-set defaults.
  mocks.handleSubscriptionCreated.mockReset().mockResolvedValue(undefined);
  mocks.handleSubscriptionUpdated.mockReset().mockResolvedValue(undefined);
  mocks.handleSubscriptionDeleted.mockReset().mockResolvedValue(undefined);
  mocks.handleInvoicePaid.mockReset().mockResolvedValue(undefined);
  mocks.handleInvoicePaymentFailed.mockReset().mockResolvedValue(undefined);
  mocks.logInsert.mockReset().mockResolvedValue({ error: null });
  mocks.logExistingRef.current = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeReq(body: string, signature: string | null = "sig_test") {
  const url = new URL("http://localhost/api/stripe/webhook");
  const headers = new Headers();
  if (signature !== null) headers.set("stripe-signature", signature);
  return new NextRequest(url, { method: "POST", headers, body });
}

describe("POST /api/stripe/webhook", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await POST(makeReq("{}", null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_signature");
  });

  it("returns 400 when signature verification fails", async () => {
    mocks.verifyWebhookSignature.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    const res = await POST(makeReq("{}", "sig_bad"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_signature");
  });

  it("returns 200 with replay:true when event_id was already logged", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_dup",
      type: "customer.subscription.created",
      data: { object: {} },
    });
    mocks.logExistingRef.current ={ event_id: "evt_dup" };
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replay).toBe(true);
    expect(mocks.handleSubscriptionCreated).not.toHaveBeenCalled();
  });

  it("dispatches customer.subscription.created and logs", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_1",
      type: "customer.subscription.created",
      data: { object: {} },
    });
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(mocks.handleSubscriptionCreated).toHaveBeenCalledTimes(1);
    expect(mocks.logInsert).toHaveBeenCalledWith({
      event_id: "evt_1",
      event_type: "customer.subscription.created",
      payload: expect.any(Object),
    });
  });

  it("dispatches customer.subscription.updated", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: { object: {} },
    });
    await POST(makeReq("{}"));
    expect(mocks.handleSubscriptionUpdated).toHaveBeenCalledTimes(1);
  });

  it("dispatches customer.subscription.deleted", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: { object: {} },
    });
    await POST(makeReq("{}"));
    expect(mocks.handleSubscriptionDeleted).toHaveBeenCalledTimes(1);
  });

  it("dispatches invoice.paid", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_4",
      type: "invoice.paid",
      data: { object: {} },
    });
    await POST(makeReq("{}"));
    expect(mocks.handleInvoicePaid).toHaveBeenCalledTimes(1);
  });

  it("dispatches invoice.payment_failed", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_5",
      type: "invoice.payment_failed",
      data: { object: {} },
    });
    await POST(makeReq("{}"));
    expect(mocks.handleInvoicePaymentFailed).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with ignored:type for unknown event types — no log inserted", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_6",
      type: "customer.tax_id.created",
      data: { object: {} },
    });
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignored).toBe("customer.tax_id.created");
    expect(mocks.logInsert).not.toHaveBeenCalled();
  });

  it("returns 500 when handler throws (so Stripe retries)", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_7",
      type: "customer.subscription.created",
      data: { object: {} },
    });
    mocks.handleSubscriptionCreated.mockRejectedValue(new Error("db dead"));
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("handler_failed");
    // Did NOT log — so Stripe will retry and we'll re-run the handler.
    expect(mocks.logInsert).not.toHaveBeenCalled();
  });

  it("treats PK conflict on log INSERT as benign (200)", async () => {
    mocks.verifyWebhookSignature.mockReturnValue({
      id: "evt_8",
      type: "customer.subscription.created",
      data: { object: {} },
    });
    mocks.logInsert.mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
  });
});
