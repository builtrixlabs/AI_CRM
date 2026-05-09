import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse, NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  recordApiAudit: vi.fn(),
}));
vi.mock("@/lib/platform/api-audit", () => ({
  recordApiAudit: mocks.recordApiAudit,
}));

import { withApiAudit } from "@/lib/api/audit-wrapper";

function makeReq(opts: {
  method?: string;
  path?: string;
  ip?: string | null;
  ua?: string | null;
} = {}): NextRequest {
  const url = new URL(`http://localhost${opts.path ?? "/api/test"}`);
  const headers = new Headers();
  if (opts.ip) headers.set("x-forwarded-for", opts.ip);
  if (opts.ua) headers.set("user-agent", opts.ua);
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    headers,
  });
}

beforeEach(() => {
  mocks.recordApiAudit.mockReset();
  mocks.recordApiAudit.mockResolvedValue(undefined);
});

describe("withApiAudit", () => {
  it("logs status_code from the handler response", async () => {
    const handler = vi.fn(async () =>
      NextResponse.json({ ok: true }, { status: 200 })
    );
    const wrapped = withApiAudit(handler, { permission: "x.y.z" });
    const res = await wrapped(makeReq({ method: "POST", path: "/api/inbox" }));
    expect(res.status).toBe(200);
    expect(mocks.recordApiAudit).toHaveBeenCalledTimes(1);
    const arg = mocks.recordApiAudit.mock.calls[0][0];
    expect(arg.method).toBe("POST");
    expect(arg.path).toBe("/api/inbox");
    expect(arg.status_code).toBe(200);
    expect(arg.permission_checked).toBe("x.y.z");
    expect(typeof arg.latency_ms).toBe("number");
  });

  it("logs 500 + rethrows when handler throws", async () => {
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    const wrapped = withApiAudit(handler);
    await expect(wrapped(makeReq())).rejects.toThrow("boom");
    expect(mocks.recordApiAudit).toHaveBeenCalledTimes(1);
    const arg = mocks.recordApiAudit.mock.calls[0][0];
    expect(arg.status_code).toBe(500);
  });

  it("captures first hop of x-forwarded-for as ip", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withApiAudit(handler);
    await wrapped(makeReq({ ip: "203.0.113.1, 10.0.0.1" }));
    const arg = mocks.recordApiAudit.mock.calls[0][0];
    expect(arg.ip).toBe("203.0.113.1");
  });

  it("logs error responses (4xx, 5xx) — not just success", async () => {
    const handler = vi.fn(async () =>
      NextResponse.json({ ok: false }, { status: 401 })
    );
    const wrapped = withApiAudit(handler);
    const res = await wrapped(makeReq());
    expect(res.status).toBe(401);
    const arg = mocks.recordApiAudit.mock.calls[0][0];
    expect(arg.status_code).toBe(401);
  });

  it("does not throw if recordApiAudit fails (best-effort)", async () => {
    mocks.recordApiAudit.mockRejectedValueOnce(new Error("audit failed"));
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withApiAudit(handler);
    const res = await wrapped(makeReq());
    expect(res.status).toBe(200);
  });
});
