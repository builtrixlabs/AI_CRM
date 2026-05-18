import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ __mock: true }),
}));

vi.mock("@/lib/integrations/sister-products/token", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    verifyToken: mocks.verifyToken,
  };
});

import {
  authenticateSisterProductRequest,
  tokenAllowedFor,
} from "@/lib/auth/sister-product-auth";

beforeEach(() => {
  mocks.verifyToken.mockReset();
});

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new Request("http://test/api/sister/v1/deals", {
    method: "GET",
    headers,
  });
}

describe("authenticateSisterProductRequest", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const r = await authenticateSisterProductRequest(makeReq());
    expect(r).toEqual({
      ok: false,
      status: 401,
      error: "missing_bearer_token",
    });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header lacks Bearer prefix", async () => {
    const r = await authenticateSisterProductRequest(
      makeReq("Basic dXNlcjpwYXNz"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("missing_bearer_token");
    }
  });

  it("treats `Bearer ` (no token) as missing_bearer_token (Fetch normalizes trailing whitespace)", async () => {
    const r = await authenticateSisterProductRequest(makeReq("Bearer "));
    expect(r).toEqual({
      ok: false,
      status: 401,
      error: "missing_bearer_token",
    });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });

  it("returns 401 when verifyToken returns null (unknown/revoked)", async () => {
    mocks.verifyToken.mockResolvedValueOnce(null);
    const r = await authenticateSisterProductRequest(
      makeReq("Bearer dead-beef"),
    );
    expect(r).toEqual({
      ok: false,
      status: 401,
      error: "invalid_or_revoked_token",
    });
    expect(mocks.verifyToken).toHaveBeenCalled();
  });

  it("returns the resolved context on a valid token", async () => {
    mocks.verifyToken.mockResolvedValueOnce({
      org_id: "00000000-0000-4000-8000-000000000001",
      product_kind: "post_sales_crm",
    });
    const r = await authenticateSisterProductRequest(
      makeReq("Bearer good-token"),
    );
    expect(r).toEqual({
      ok: true,
      org_id: "00000000-0000-4000-8000-000000000001",
      product_kind: "post_sales_crm",
    });
  });
});

describe("tokenAllowedFor", () => {
  it("returns true when product_kind is in the allowlist", () => {
    expect(tokenAllowedFor("post_sales_crm", ["post_sales_crm"])).toBe(true);
    expect(
      tokenAllowedFor("lead_sources", [
        "post_sales_crm",
        "lead_sources",
      ]),
    ).toBe(true);
  });

  it("returns false when product_kind is not in the allowlist", () => {
    expect(tokenAllowedFor("legal_auditor", ["post_sales_crm"])).toBe(false);
    expect(tokenAllowedFor("post_sales_crm", [])).toBe(false);
  });
});
