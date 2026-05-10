import { describe, expect, it, vi } from "vitest";
import {
  attemptDelivery,
  checkUrlSsrf,
  classifyResponse,
  enqueueDelivery,
  type DeliveryRow,
  type EndpointRow,
} from "@/lib/webhooks/deliver";
import { verifySignature } from "@/lib/webhooks/signing";

const DELIVERY: DeliveryRow = {
  id: "del-1",
  organization_id: "org-1",
  endpoint_id: "ep-1",
  event_kind: "lead.created",
  payload: { lead_id: "lead-1" },
  attempt_number: 1,
};

const ENDPOINT: EndpointRow = {
  id: "ep-1",
  url: "https://customer.example.com/webhook",
  secret: "topsecret",
  disabled_at: null,
};

function makeFetch(opts: {
  status?: number;
  body?: string;
  throws?: boolean;
}) {
  return vi.fn(async () => {
    if (opts.throws) throw new Error("ECONNRESET");
    return new Response(opts.body ?? "", {
      status: opts.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("deliver.checkUrlSsrf", () => {
  it.each([
    ["https://customer.example.com/webhook", null],
    ["http://api.someorg.io/path", null],
    ["https://example.com:8443/x", null],
    ["http://localhost/x", "loopback_host"],
    ["http://localhost:3000/x", "loopback_host"],
    ["http://127.0.0.1/x", "loopback_ipv4"],
    ["http://127.1.2.3/x", "loopback_ipv4"],
    ["http://10.0.0.1/x", "private_rfc1918"],
    ["http://192.168.1.1/x", "private_rfc1918"],
    ["http://172.16.0.1/x", "private_rfc1918"],
    ["http://172.31.255.255/x", "private_rfc1918"],
    ["http://172.15.0.1/x", null], // outside RFC 1918
    ["http://172.32.0.1/x", null], // outside RFC 1918
    ["http://169.254.169.254/latest/meta-data/", "link_local"],
    ["http://0.0.0.0/x", "reserved"],
    ["http://[::1]/x", "loopback_ipv6"],
    ["http://[fe80::1]/x", "link_local_ipv6"],
    ["http://[fc00::1]/x", "ula_ipv6"],
    ["http://[fd00::1]/x", "ula_ipv6"],
    ["ftp://example.com/x", "unsupported_protocol"],
    ["javascript:alert(1)", "unsupported_protocol"],
    ["not-a-url", "invalid_url"],
  ])("%s -> %s", (url, expected) => {
    expect(checkUrlSsrf(url)).toBe(expected);
  });
});

describe("deliver.classifyResponse", () => {
  it.each([
    [200, false, "delivered"],
    [201, false, "delivered"],
    [204, false, "delivered"],
    [400, false, "dead"],
    [401, false, "dead"],
    [403, false, "dead"],
    [404, false, "dead"],
    [408, false, "retry"], // request timeout
    [429, false, "retry"], // rate limited
    [500, false, "retry"],
    [502, false, "retry"],
    [503, false, "retry"],
    [null, true, "retry"], // network error
    [null, false, "retry"], // unknown
  ])("status=%s networkErr=%s -> %s", (status, networkErr, expected) => {
    expect(classifyResponse(status, networkErr)).toBe(expected);
  });
});

describe("deliver.attemptDelivery", () => {
  it("2xx response -> delivered with status_code + latency_ms", async () => {
    const fetcher = makeFetch({ status: 200, body: '{"received":true}' });
    const r = await attemptDelivery(DELIVERY, ENDPOINT, fetcher as never);
    expect(r.outcome).toBe("delivered");
    expect(r.status_code).toBe(200);
    expect(r.response_body).toBe('{"received":true}');
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
    expect(r.error_message).toBeUndefined();
  });

  it("4xx response -> dead with the response body for forensics", async () => {
    const fetcher = makeFetch({ status: 404, body: "not found" });
    const r = await attemptDelivery(DELIVERY, ENDPOINT, fetcher as never);
    expect(r.outcome).toBe("dead");
    expect(r.status_code).toBe(404);
    expect(r.response_body).toBe("not found");
  });

  it("5xx response -> retry", async () => {
    const fetcher = makeFetch({ status: 503 });
    const r = await attemptDelivery(DELIVERY, ENDPOINT, fetcher as never);
    expect(r.outcome).toBe("retry");
    expect(r.status_code).toBe(503);
  });

  it("network error -> retry with error_message", async () => {
    const fetcher = makeFetch({ throws: true });
    const r = await attemptDelivery(DELIVERY, ENDPOINT, fetcher as never);
    expect(r.outcome).toBe("retry");
    expect(r.status_code).toBeNull();
    expect(r.error_message).toBe("ECONNRESET");
  });

  it("disabled endpoint -> dead without firing fetch", async () => {
    const fetcher = makeFetch({ status: 200 });
    const r = await attemptDelivery(
      DELIVERY,
      { ...ENDPOINT, disabled_at: "2026-05-09T00:00:00Z" },
      fetcher as never
    );
    expect(r.outcome).toBe("dead");
    expect(r.error_message).toBe("endpoint_disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("SSRF target (loopback) -> dead without firing fetch", async () => {
    const fetcher = makeFetch({ status: 200 });
    const r = await attemptDelivery(
      DELIVERY,
      { ...ENDPOINT, url: "http://127.0.0.1:8080/probe" },
      fetcher as never
    );
    expect(r.outcome).toBe("dead");
    expect(r.error_message).toBe("ssrf_blocked:loopback_ipv4");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("SSRF target (cloud metadata) -> dead without firing fetch", async () => {
    const fetcher = makeFetch({ status: 200 });
    const r = await attemptDelivery(
      DELIVERY,
      { ...ENDPOINT, url: "http://169.254.169.254/latest/meta-data/" },
      fetcher as never
    );
    expect(r.outcome).toBe("dead");
    expect(r.error_message).toBe("ssrf_blocked:link_local");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("signs the request body with the endpoint secret", async () => {
    let capturedHeaders: Headers | null = null;
    let capturedBody = "";
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      capturedHeaders = new Headers(init.headers as HeadersInit);
      capturedBody = init.body as string;
      return new Response("", { status: 200 });
    });
    await attemptDelivery(DELIVERY, ENDPOINT, fetcher as never);
    expect(capturedHeaders).not.toBeNull();
    const sig = capturedHeaders!.get("x-builtrix-signature");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature(ENDPOINT.secret, capturedBody, sig)).toBe(true);
  });

  it("sets x-builtrix-event-kind + x-builtrix-attempt headers", async () => {
    let capturedHeaders: Headers | null = null;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      capturedHeaders = new Headers(init.headers as HeadersInit);
      return new Response("", { status: 200 });
    });
    await attemptDelivery(
      { ...DELIVERY, attempt_number: 3 },
      ENDPOINT,
      fetcher as never
    );
    expect(capturedHeaders!.get("x-builtrix-event-kind")).toBe("lead.created");
    expect(capturedHeaders!.get("x-builtrix-attempt")).toBe("3");
  });

  it("truncates response body at 4KB", async () => {
    const big = "x".repeat(10_000);
    const fetcher = makeFetch({ status: 200, body: big });
    const r = await attemptDelivery(DELIVERY, ENDPOINT, fetcher as never);
    expect(r.response_body!.length).toBe(4096);
  });
});

describe("deliver.enqueueDelivery", () => {
  it("inserts a pending row with attempt=1 and next_retry_at=now", async () => {
    const inserts: unknown[] = [];
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn((row: unknown) => {
          inserts.push(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: { id: "del-new" }, error: null })
              ),
            })),
          };
        }),
      })),
    };
    const r = await enqueueDelivery(
      {
        endpoint_id: "ep-1",
        organization_id: "org-1",
        event_kind: "lead.created",
        payload: { lead_id: "lead-1" },
      },
      client as never
    );
    expect(r).toEqual({ ok: true, delivery_id: "del-new" });
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.status).toBe("pending");
    expect(row.attempt_number).toBe(1);
    expect(typeof row.next_retry_at).toBe("string");
    expect(row.payload).toEqual({ lead_id: "lead-1" });
  });

  it("returns error when DB insert fails", async () => {
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({ data: null, error: { message: "boom" } })
            ),
          })),
        })),
      })),
    };
    const r = await enqueueDelivery(
      {
        endpoint_id: "ep-1",
        organization_id: "org-1",
        event_kind: "x",
        payload: {},
      },
      client as never
    );
    expect(r).toEqual({ ok: false, error: "boom" });
  });
});
