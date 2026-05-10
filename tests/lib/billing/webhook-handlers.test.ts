import { describe, expect, it, vi } from "vitest";
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "@/lib/billing/webhook-handlers";

const ORG_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function makeClient(opts: {
  org_id_for_customer?: string | null;
  org_id_for_subscription?: string | null;
}) {
  const updates: { table: string; payload: unknown; eq: [string, unknown] }[] =
    [];
  const audits: unknown[] = [];

  const subsChain = {
    select: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => ({
        maybeSingle: vi.fn(() => {
          if (col === "stripe_customer_id") {
            return Promise.resolve({
              data:
                opts.org_id_for_customer === undefined
                  ? null
                  : { organization_id: opts.org_id_for_customer },
              error: null,
            });
          }
          if (col === "stripe_subscription_id") {
            return Promise.resolve({
              data:
                opts.org_id_for_subscription === undefined
                  ? null
                  : { organization_id: opts.org_id_for_subscription },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    })),
    update: vi.fn((row: unknown) => ({
      eq: vi.fn((_col: string, val: unknown) => {
        updates.push({ table: "subscriptions", payload: row, eq: ["organization_id", val] });
        return Promise.resolve({ error: null });
      }),
    })),
  };

  const auditChain = {
    insert: vi.fn((row: unknown) => {
      audits.push(row);
      return Promise.resolve({ error: null });
    }),
  };

  return {
    updates,
    audits,
    client: {
      from: vi.fn((t: string) => {
        if (t === "subscriptions") return subsChain;
        if (t === "audit_log") return auditChain;
        throw new Error(`unexpected ${t}`);
      }),
    },
  };
}

function subEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_x",
    type: "customer.subscription.created" as const,
    data: {
      object: {
        id: "sub_x",
        customer: "cus_x",
        status: "active",
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { lookup_key: "professional", nickname: null },
              current_period_end: 1730000000,
            },
          ],
        },
        metadata: { org_id: ORG_ID },
        ...overrides,
      },
    },
  };
}

function invoiceEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_inv",
    type: "invoice.paid" as const,
    data: {
      object: {
        id: "in_x",
        customer: "cus_x",
        amount_paid: 1499900,
        amount_due: 1499900,
        currency: "inr",
        attempt_count: 1,
        ...overrides,
      },
    },
  };
}

describe("handleSubscriptionCreated", () => {
  it("updates subscription with tier from price.lookup_key + audits", async () => {
    const env = makeClient({ org_id_for_customer: ORG_ID });
    await handleSubscriptionCreated(subEvent() as never, env.client as never);
    expect(env.updates).toHaveLength(1);
    const row = env.updates[0].payload as Record<string, unknown>;
    expect(row.status).toBe("active");
    expect(row.plan_tier).toBe("professional");
    expect(row.stripe_subscription_id).toBe("sub_x");
    expect(row.grace_period_until).toBeNull();
    expect(env.audits).toHaveLength(1);
    expect((env.audits[0] as { action: string }).action).toBe(
      "subscription_stripe_created"
    );
  });

  it("uses metadata.org_id over customer-id lookup when both present", async () => {
    const env = makeClient({ org_id_for_customer: "different-org" });
    await handleSubscriptionCreated(subEvent() as never, env.client as never);
    expect(env.updates[0].eq[1]).toBe(ORG_ID);
  });

  it("falls back to customer-id lookup when metadata absent", async () => {
    const env = makeClient({ org_id_for_customer: ORG_ID });
    const ev = subEvent({ metadata: undefined });
    await handleSubscriptionCreated(ev as never, env.client as never);
    expect(env.updates[0].eq[1]).toBe(ORG_ID);
  });

  it("no-ops when customer + metadata both yield no org", async () => {
    const env = makeClient({ org_id_for_customer: null });
    const ev = subEvent({ metadata: undefined });
    await handleSubscriptionCreated(ev as never, env.client as never);
    expect(env.updates).toHaveLength(0);
    expect(env.audits).toHaveLength(0);
  });
});

describe("handleSubscriptionUpdated", () => {
  it("looks up by stripe_subscription_id and updates plan_tier + status", async () => {
    const env = makeClient({ org_id_for_subscription: ORG_ID });
    const ev = subEvent({ status: "past_due" });
    ev.type = "customer.subscription.updated" as never;
    await handleSubscriptionUpdated(ev as never, env.client as never);
    expect(env.updates).toHaveLength(1);
    const row = env.updates[0].payload as Record<string, unknown>;
    expect(row.status).toBe("past_due");
    expect((env.audits[0] as { action: string }).action).toBe(
      "subscription_stripe_updated"
    );
  });
});

describe("handleSubscriptionDeleted", () => {
  it("flips to cancelled, clears stripe_subscription_id, sets 30-day grace", async () => {
    const env = makeClient({ org_id_for_subscription: ORG_ID });
    const ev = subEvent();
    ev.type = "customer.subscription.deleted" as never;
    await handleSubscriptionDeleted(ev as never, env.client as never);
    const row = env.updates[0].payload as Record<string, unknown>;
    expect(row.status).toBe("cancelled");
    expect(row.stripe_subscription_id).toBeNull();
    expect(typeof row.current_period_end).toBe("string");
    expect((env.audits[0] as { action: string }).action).toBe(
      "subscription_stripe_deleted"
    );
  });
});

describe("handleInvoicePaid", () => {
  it("sets status=active, clears grace_period_until, audits invoice_paid", async () => {
    const env = makeClient({ org_id_for_customer: ORG_ID });
    await handleInvoicePaid(invoiceEvent() as never, env.client as never);
    const row = env.updates[0].payload as Record<string, unknown>;
    expect(row.status).toBe("active");
    expect(row.grace_period_until).toBeNull();
    const aud = env.audits[0] as {
      action: string;
      diff: { amount: number; currency: string };
    };
    expect(aud.action).toBe("subscription_stripe_invoice_paid");
    expect(aud.diff.amount).toBe(1499900);
    expect(aud.diff.currency).toBe("inr");
  });

  it("no-ops when customer can't be resolved", async () => {
    const env = makeClient({ org_id_for_customer: null });
    await handleInvoicePaid(invoiceEvent() as never, env.client as never);
    expect(env.updates).toHaveLength(0);
  });
});

describe("handleInvoicePaymentFailed", () => {
  it("sets status=past_due, grace_period_until=now+30d, audits", async () => {
    const env = makeClient({ org_id_for_customer: ORG_ID });
    const ev = invoiceEvent({ attempt_count: 2 });
    ev.type = "invoice.payment_failed" as never;
    await handleInvoicePaymentFailed(ev as never, env.client as never);
    const row = env.updates[0].payload as Record<string, unknown>;
    expect(row.status).toBe("past_due");
    expect(typeof row.grace_period_until).toBe("string");
    const aud = env.audits[0] as {
      action: string;
      diff: { attempt_count: number };
    };
    expect(aud.action).toBe("subscription_stripe_payment_failed");
    expect(aud.diff.attempt_count).toBe(2);
  });
});
