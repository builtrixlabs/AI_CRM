import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  consume: vi.fn(),
  ingest: vi.fn(),
  logMihInbound: vi.fn(),
}));
vi.mock("@/lib/auth/sister-product-auth", () => ({
  authenticateSisterProductRequest: mocks.authenticate,
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  createLimiter: () => ({ consume: mocks.consume, _reset: vi.fn() }),
}));
vi.mock("@/lib/integrations/mih/ingest", () => ({
  ingestMihLead: mocks.ingest,
  logMihInbound: mocks.logMihInbound,
}));

import { POST } from "@/app/api/sister/v1/leads/route";

const ORG = "11111111-2222-4333-8444-555555555555";

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organization_id: ORG,
    external_id: "mih-ext-001",
    name: "Asha Rao",
    phone_e164: "+919876543210",
    source: "meta_lead_ads",
    source_channel: "paid_social",
    source_received_at: "2026-05-14T10:00:00.000Z",
    preference: { bhk: 3 },
    raw_payload: { form_id: "abc" },
    ...over,
  };
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/sister/v1/leads", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: "Bearer x" },
  });
}

beforeEach(() => {
  mocks.authenticate.mockReset();
  mocks.consume.mockReset();
  mocks.ingest.mockReset();
  mocks.logMihInbound.mockReset();
  mocks.authenticate.mockResolvedValue({
    ok: true,
    org_id: ORG,
    product_kind: "marketing_intelligence_hub",
  });
  mocks.consume.mockResolvedValue({
    allowed: true,
    remaining: 99,
    retry_after_ms: 0,
  });
  mocks.ingest.mockResolvedValue({
    ok: true,
    lead_id: "lead-1",
    status: "created",
  });
  mocks.logMihInbound.mockResolvedValue(undefined);
});

describe("POST /api/sister/v1/leads", () => {
  it("201 created on a valid request", async () => {
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      lead_id: "lead-1",
      status: "created",
      allocated_to_user_id: null,
    });
  });

  it("201 duplicate_merged when ingest reports a merge", async () => {
    mocks.ingest.mockResolvedValue({
      ok: true,
      lead_id: "lead-9",
      status: "duplicate_merged",
    });
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("duplicate_merged");
  });

  it("401 when the Bearer token is missing/invalid", async () => {
    mocks.authenticate.mockResolvedValue({
      ok: false,
      status: 401,
      error: "missing_bearer_token",
    });
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(401);
  });

  it("403 when the token's product_kind is not MIH", async () => {
    mocks.authenticate.mockResolvedValue({
      ok: true,
      org_id: ORG,
      product_kind: "something_else",
    });
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("wrong_product_kind");
  });

  it("403 when body.organization_id != token org", async () => {
    const res = await POST(
      makeReq(validBody({ organization_id: "99999999-2222-4333-8444-555555555555" })),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("cross_tenant_violation");
  });

  it("400 on a schema violation (closed source_channel enum)", async () => {
    const res = await POST(makeReq(validBody({ source_channel: "carrier_pigeon" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation");
    expect(body.fieldErrors).toBeDefined();
  });

  it("400 on invalid JSON", async () => {
    const res = await POST(makeReq("{not json"));
    expect(res.status).toBe(400);
  });

  it("429 with a Retry-After header when rate limited", async () => {
    mocks.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retry_after_ms: 800,
    });
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(mocks.logMihInbound).toHaveBeenCalledTimes(1);
  });

  it("fails open (still 201) when the rate limiter throws", async () => {
    mocks.consume.mockRejectedValue(new Error("kv down"));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(201);
  });

  it("500 when ingest fails internally", async () => {
    mocks.ingest.mockResolvedValue({
      ok: false,
      reason: "internal",
      message: "db boom",
    });
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(500);
  });
});
