import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWebhookWorker } from "@/lib/webhooks/worker";

type Delivery = {
  id: string;
  organization_id: string;
  endpoint_id: string;
  event_kind: string;
  payload: Record<string, unknown>;
  attempt_number: number;
  status: "pending" | "delivered" | "failed" | "dead";
  next_retry_at: string;
  status_code?: number | null;
  error_message?: string | null;
};

type Endpoint = {
  id: string;
  url: string;
  secret: string;
  enabled: boolean;
  disabled_at: string | null;
  consecutive_failures: number;
};

let deliveries: Delivery[];
let endpoints: Endpoint[];

const baseDelivery = (overrides: Partial<Delivery> = {}): Delivery => ({
  id: "del-1",
  organization_id: "org-1",
  endpoint_id: "ep-1",
  event_kind: "lead.created",
  payload: { lead_id: "lead-1" },
  attempt_number: 1,
  status: "pending",
  next_retry_at: new Date(Date.now() - 1000).toISOString(),
  ...overrides,
});

const baseEndpoint = (overrides: Partial<Endpoint> = {}): Endpoint => ({
  id: "ep-1",
  url: "https://customer.example.com/webhook",
  secret: "topsecret",
  enabled: true,
  disabled_at: null,
  consecutive_failures: 0,
  ...overrides,
});

function makeClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === "webhook_deliveries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              lte: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() =>
                    Promise.resolve({
                      data: deliveries.filter(
                        (d) =>
                          d.status === "pending" &&
                          new Date(d.next_retry_at).getTime() <= Date.now()
                      ),
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          })),
          update: vi.fn((row: Partial<Delivery>) => ({
            eq: vi.fn((_col: string, val: unknown) => {
              const d = deliveries.find((x) => x.id === val);
              if (d) Object.assign(d, row);
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      if (table === "webhook_endpoints") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, val: unknown) => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: endpoints.find((e) => e.id === val) ?? null,
                  error: null,
                })
              ),
            })),
          })),
          update: vi.fn((row: Partial<Endpoint>) => ({
            eq: vi.fn((_col: string, val: unknown) => {
              const e = endpoints.find((x) => x.id === val);
              if (e) Object.assign(e, row);
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      throw new Error(`unexpected ${table}`);
    }),
  };
}

beforeEach(() => {
  deliveries = [];
  endpoints = [];
});

describe("worker.runWebhookWorker", () => {
  it("delivers a 2xx response: marks delivered, resets endpoint counter", async () => {
    deliveries.push(baseDelivery());
    endpoints.push(baseEndpoint({ consecutive_failures: 7 }));
    const fetcher = vi.fn(
      async () => new Response("ok", { status: 200 })
    );
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary).toMatchObject({
      scanned: 1,
      delivered: 1,
      retried: 0,
      dead: 0,
    });
    expect(deliveries[0].status).toBe("delivered");
    expect(endpoints[0].consecutive_failures).toBe(0);
  });

  it("retries on 5xx: bumps attempt_number + next_retry_at, increments endpoint counter", async () => {
    deliveries.push(baseDelivery({ attempt_number: 2 }));
    endpoints.push(baseEndpoint({ consecutive_failures: 3 }));
    const fetcher = vi.fn(async () => new Response("", { status: 503 }));
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary.retried).toBe(1);
    expect(deliveries[0].status).toBe("pending");
    expect(deliveries[0].attempt_number).toBe(3);
    expect(endpoints[0].consecutive_failures).toBe(4);
  });

  it("dead on 4xx: status=failed, no retry, error preserved", async () => {
    deliveries.push(baseDelivery());
    endpoints.push(baseEndpoint());
    const fetcher = vi.fn(
      async () => new Response("nope", { status: 404 })
    );
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary.dead).toBe(1);
    expect(deliveries[0].status).toBe("failed");
    expect(deliveries[0].next_retry_at).toBeNull();
    expect(deliveries[0].status_code).toBe(404);
  });

  it("dead on attempt 6 (max attempts) even if 5xx: status=dead", async () => {
    deliveries.push(baseDelivery({ attempt_number: 6 }));
    endpoints.push(baseEndpoint());
    const fetcher = vi.fn(async () => new Response("", { status: 500 }));
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary.dead).toBe(1);
    expect(deliveries[0].status).toBe("dead");
  });

  it("auto-disables endpoint at 10 consecutive failures", async () => {
    deliveries.push(baseDelivery());
    endpoints.push(baseEndpoint({ consecutive_failures: 9 }));
    const fetcher = vi.fn(async () => new Response("", { status: 500 }));
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(endpoints[0].consecutive_failures).toBe(10);
    expect(endpoints[0].disabled_at).toBeTruthy();
    expect(summary.endpoints_disabled).toBe(1);
  });

  it("does not double-disable an already-disabled endpoint", async () => {
    deliveries.push(baseDelivery());
    endpoints.push(
      baseEndpoint({
        disabled_at: "2026-05-09T00:00:00Z",
        consecutive_failures: 15,
      })
    );
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    // Endpoint is already disabled -> worker marks delivery dead WITHOUT firing fetch.
    expect(summary.dead).toBe(1);
    expect(summary.endpoints_disabled).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips deliveries where endpoint was deleted (not_found)", async () => {
    deliveries.push(baseDelivery({ endpoint_id: "ep-missing" }));
    const fetcher = vi.fn();
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary.dead).toBe(1);
    expect(deliveries[0].status).toBe("dead");
    expect(deliveries[0].error_message).toBe("endpoint_not_found");
  });

  it("does NOT pick up deliveries with future next_retry_at", async () => {
    deliveries.push(
      baseDelivery({
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
      })
    );
    endpoints.push(baseEndpoint());
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary.scanned).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("handles network error as retry", async () => {
    deliveries.push(baseDelivery());
    endpoints.push(baseEndpoint());
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary.retried).toBe(1);
    expect(deliveries[0].status).toBe("pending");
    expect(deliveries[0].error_message).toBe("ECONNRESET");
  });

  it("processes multiple pending deliveries in one sweep", async () => {
    deliveries.push(baseDelivery({ id: "d1" }));
    deliveries.push(baseDelivery({ id: "d2" }));
    endpoints.push(baseEndpoint());
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const summary = await runWebhookWorker(makeClient() as never, fetcher as never);
    expect(summary.scanned).toBe(2);
    expect(summary.delivered).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
