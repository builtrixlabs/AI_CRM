import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetStripeClient,
  createBillingPortalSession,
  createCheckoutSession,
  retrieveSubscription,
  verifyWebhookSignature,
} from "@/lib/billing/stripe";

const ORIG_ENV = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  _resetStripeClient();
  for (const [k, v] of Object.entries(ORIG_ENV)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string>)[k] = v;
  }
});

describe("stripe.createCheckoutSession", () => {
  it("builds subscription-mode payload with metadata + line items", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/cs_test_123",
    });
    const fakeClient = { checkout: { sessions: { create } } };
    const result = await createCheckoutSession(
      {
        org_id: "org-1",
        customer_id: null,
        customer_email: "rep@example.com",
        price_id: "price_test_pro",
        return_url: "https://crm.example.com/admin/billing",
      },
      fakeClient as never
    );
    expect(result).toEqual({
      url: "https://checkout.stripe.com/c/cs_test_123",
      session_id: "cs_test_123",
    });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.line_items).toEqual([{ price: "price_test_pro", quantity: 1 }]);
    expect(args.customer_email).toBe("rep@example.com");
    expect(args.customer).toBeUndefined();
    expect(args.metadata).toEqual({ org_id: "org-1" });
    expect(args.subscription_data?.metadata).toEqual({ org_id: "org-1" });
    expect(args.success_url).toContain("?stripe=success");
    expect(args.cancel_url).toContain("?stripe=cancelled");
  });

  it("uses customer ID when provided (skips customer_email)", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "cs_x",
      url: "https://checkout.stripe.com/c/cs_x",
    });
    await createCheckoutSession(
      {
        org_id: "org-1",
        customer_id: "cus_existing",
        customer_email: "rep@example.com",
        price_id: "price_test_pro",
        return_url: "https://x/",
      },
      { checkout: { sessions: { create } } } as never
    );
    const args = create.mock.calls[0][0];
    expect(args.customer).toBe("cus_existing");
    expect(args.customer_email).toBeUndefined();
  });

  it("throws when Stripe returns no URL", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: "cs_x", url: null });
    await expect(
      createCheckoutSession(
        {
          org_id: "o",
          customer_id: null,
          customer_email: "x@x",
          price_id: "p",
          return_url: "/",
        },
        { checkout: { sessions: { create } } } as never
      )
    ).rejects.toThrow(/no URL/);
  });
});

describe("stripe.createBillingPortalSession", () => {
  it("creates a portal session with return_url", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ url: "https://billing.stripe.com/p/123" });
    const r = await createBillingPortalSession(
      { customer_id: "cus_x", return_url: "https://x/admin/billing" },
      { billingPortal: { sessions: { create } } } as never
    );
    expect(r).toEqual({ url: "https://billing.stripe.com/p/123" });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_x",
      return_url: "https://x/admin/billing",
    });
  });
});

describe("stripe.retrieveSubscription", () => {
  it("returns the Subscription on success", async () => {
    const sub = { id: "sub_x", status: "active" };
    const retrieve = vi.fn().mockResolvedValue(sub);
    const r = await retrieveSubscription("sub_x", {
      subscriptions: { retrieve },
    } as never);
    expect(r).toBe(sub);
  });

  it("returns null on 404", async () => {
    const StripeMod = (await import("stripe")).default;
    const err = new StripeMod.errors.StripeInvalidRequestError({
      type: "StripeInvalidRequestError",
      message: "No such subscription",
    });
    Object.assign(err, { statusCode: 404 });
    const retrieve = vi.fn().mockRejectedValue(err);
    const r = await retrieveSubscription("sub_missing", {
      subscriptions: { retrieve },
    } as never);
    expect(r).toBeNull();
  });

  it("rethrows non-404 Stripe errors", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      retrieveSubscription("sub_x", {
        subscriptions: { retrieve },
      } as never)
    ).rejects.toThrow(/network/);
  });
});

describe("stripe.verifyWebhookSignature", () => {
  it("delegates to client.webhooks.constructEvent with the env secret", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const event = { id: "evt_1", type: "customer.subscription.created" };
    const constructEvent = vi.fn().mockReturnValue(event);
    const r = verifyWebhookSignature("body", "sig_x", {
      webhooks: { constructEvent },
    } as never);
    expect(r).toBe(event);
    expect(constructEvent).toHaveBeenCalledWith("body", "sig_x", "whsec_test");
  });

  it("throws when STRIPE_WEBHOOK_SECRET is missing in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() =>
      verifyWebhookSignature("body", "sig", {
        webhooks: { constructEvent: vi.fn() },
      } as never)
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("propagates SDK signature errors (Stripe throws on tamper)", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const constructEvent = vi.fn().mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    expect(() =>
      verifyWebhookSignature("body", "sig_bad", {
        webhooks: { constructEvent },
      } as never)
    ).toThrow(/No signatures/);
  });
});
