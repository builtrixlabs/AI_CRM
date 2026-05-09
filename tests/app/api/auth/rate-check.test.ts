import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/platform/api-audit", () => ({
  recordApiAudit: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/auth/rate-check/route";
import { loginBucket } from "@/lib/auth/rate-limit";

function makeReq(ip: string): NextRequest {
  const url = new URL("http://localhost/api/auth/rate-check");
  const headers = new Headers();
  headers.set("x-forwarded-for", ip);
  return new NextRequest(url, { method: "POST", headers });
}

beforeEach(() => {
  loginBucket._reset();
});

describe("POST /api/auth/rate-check", () => {
  it("returns 200 with remaining=4 on the first hit from an IP", async () => {
    const res = await POST(makeReq("203.0.113.1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(4);
    expect(body.limit).toBe(5);
    expect(body.window_seconds).toBe(60);
  });

  it("returns 429 after capacity exhausted", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(makeReq("203.0.113.2"));
    }
    const res = await POST(makeReq("203.0.113.2"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.allowed).toBe(false);
    expect(body.error).toBe("rate_limited");
    expect(body.retry_after_seconds).toBeGreaterThanOrEqual(0);
  });

  it("isolates per-IP — exhausting IP A does not block IP B", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(makeReq("203.0.113.3"));
    }
    expect((await POST(makeReq("203.0.113.3"))).status).toBe(429);
    const res = await POST(makeReq("203.0.113.4"));
    expect(res.status).toBe(200);
  });
});
