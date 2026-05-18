import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/platform/api-audit", () => ({
  recordApiAudit: vi.fn().mockResolvedValue(undefined),
}));

const auditInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: auditInsert }),
  }),
}));

import { POST } from "@/app/api/auth/rate-check/route";
import {
  loginAccountBucket,
  loginBucket,
} from "@/lib/auth/rate-limit";

function makeReq(opts: {
  ip: string;
  email?: string;
}): NextRequest {
  const url = new URL("http://localhost/api/auth/rate-check");
  const headers = new Headers();
  headers.set("x-forwarded-for", opts.ip);
  if (opts.email !== undefined) {
    headers.set("content-type", "application/json");
    return new NextRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: opts.email }),
    });
  }
  return new NextRequest(url, { method: "POST", headers });
}

beforeEach(() => {
  loginBucket._reset();
  loginAccountBucket._reset();
  auditInsert.mockClear();
});

describe("POST /api/auth/rate-check — per-IP axis (D-210)", () => {
  it("200 with remaining=4 on the first hit from an IP", async () => {
    const res = await POST(makeReq({ ip: "203.0.113.1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(4);
    expect(body.limit).toBe(5);
    expect(body.window_seconds).toBe(60);
  });

  it("429 after IP capacity exhausted", async () => {
    for (let i = 0; i < 5; i++) await POST(makeReq({ ip: "203.0.113.2" }));
    const res = await POST(makeReq({ ip: "203.0.113.2" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.allowed).toBe(false);
    expect(body.error).toBe("rate_limited");
    expect(body.axis).toBe("ip");
    expect(body.retry_after_seconds).toBeGreaterThanOrEqual(0);
  });

  it("isolates per-IP — exhausting IP A does not block IP B", async () => {
    for (let i = 0; i < 5; i++) await POST(makeReq({ ip: "203.0.113.3" }));
    expect((await POST(makeReq({ ip: "203.0.113.3" }))).status).toBe(429);
    const res = await POST(makeReq({ ip: "203.0.113.4" }));
    expect(res.status).toBe(200);
  });

  it("audit row written on IP denial", async () => {
    for (let i = 0; i < 5; i++) await POST(makeReq({ ip: "203.0.113.5" }));
    auditInsert.mockClear();
    await POST(makeReq({ ip: "203.0.113.5" }));
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const call = auditInsert.mock.calls[0]![0] as {
      action: string;
      diff: { axis: string };
    };
    expect(call.action).toBe("auth.rate_limited");
    expect(call.diff.axis).toBe("ip");
  });
});

describe("POST /api/auth/rate-check — per-account axis (D-301)", () => {
  it("21st attempt on the same email blocks regardless of IP", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await POST(
        makeReq({ ip: `192.0.2.${i + 1}`, email: "victim@example.com" })
      );
      expect(res.status).toBe(200);
    }
    const res = await POST(
      makeReq({ ip: "192.0.2.99", email: "victim@example.com" })
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.axis).toBe("email");
    expect(body.limit).toBe(20);
    expect(body.window_seconds).toBe(60 * 60);
  });

  it("audit row written on account denial", async () => {
    for (let i = 0; i < 20; i++) {
      await POST(
        makeReq({ ip: `192.0.2.${i + 1}`, email: "victim@example.com" })
      );
    }
    auditInsert.mockClear();
    await POST(
      makeReq({ ip: "192.0.2.99", email: "victim@example.com" })
    );
    expect(auditInsert).toHaveBeenCalledTimes(1);
    const call = auditInsert.mock.calls[0]![0] as {
      action: string;
      diff: { axis: string };
    };
    expect(call.action).toBe("auth.rate_limited");
    expect(call.diff.axis).toBe("email");
  });

  it("normalises email to lowercased trim", async () => {
    for (let i = 0; i < 20; i++) {
      await POST(
        makeReq({ ip: `192.0.2.${i + 1}`, email: "Victim@example.com" })
      );
    }
    const res = await POST(
      makeReq({ ip: "192.0.2.99", email: "  victim@EXAMPLE.com  " })
    );
    expect(res.status).toBe(429);
    expect((await res.json()).axis).toBe("email");
  });

  it("missing email body falls through to IP-only check", async () => {
    const res = await POST(makeReq({ ip: "203.0.113.10" }));
    expect(res.status).toBe(200);
    expect((await res.json()).remaining).toBe(4);
  });

  it("malformed JSON body still works (treats as no email)", async () => {
    const url = new URL("http://localhost/api/auth/rate-check");
    const headers = new Headers();
    headers.set("x-forwarded-for", "203.0.113.11");
    headers.set("content-type", "application/json");
    const req = new NextRequest(url, {
      method: "POST",
      headers,
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
