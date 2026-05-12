import { describe, expect, it, vi, beforeEach } from "vitest";
import { encryptJson } from "@/lib/comms/encryption";

const VALID_ORG = "00000000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/webhooks/telephony/exotel/call-status/route";

function basicAuth(api_key: string, api_token: string): string {
  return (
    "Basic " +
    Buffer.from(`${api_key}:${api_token}`, "utf8").toString("base64")
  );
}

function makeRequest(opts: {
  org: string | null;
  auth?: string;
  body?: string;
}): Request {
  const url = opts.org === null
    ? "http://test/api/webhooks/telephony/exotel/call-status"
    : `http://test/api/webhooks/telephony/exotel/call-status?org=${encodeURIComponent(opts.org)}`;
  return new Request(url, {
    method: "POST",
    headers: {
      ...(opts.auth ? { authorization: opts.auth } : {}),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: opts.body ?? "CallSid=ex-1&Status=completed",
  });
}

beforeEach(() => {
  mocks.maybeSingle.mockReset();
});

describe("POST /api/webhooks/telephony/exotel/call-status", () => {
  it("returns 400 when ?org missing", async () => {
    const res = await POST(makeRequest({ org: null }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ?org is not a UUID", async () => {
    const res = await POST(makeRequest({ org: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when org has no telephony config", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null });
    const res = await POST(
      makeRequest({ org: VALID_ORG, auth: basicAuth("k", "t") }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when org config is inactive", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        encrypted_credentials: encryptJson({
          account_sid: "s",
          api_key: "k",
          api_token: "t",
        }),
        provider: "exotel",
        is_active: false,
      },
    });
    const res = await POST(
      makeRequest({ org: VALID_ORG, auth: basicAuth("k", "t") }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when Authorization header doesn't match stored creds", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        encrypted_credentials: encryptJson({
          account_sid: "s",
          api_key: "correct-key",
          api_token: "correct-token",
        }),
        provider: "exotel",
        is_active: true,
      },
    });
    const res = await POST(
      makeRequest({
        org: VALID_ORG,
        auth: basicAuth("wrong-key", "wrong-token"),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 ok when credentials match", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        encrypted_credentials: encryptJson({
          account_sid: "s",
          api_key: "correct-key",
          api_token: "correct-token",
        }),
        provider: "exotel",
        is_active: true,
      },
    });
    const res = await POST(
      makeRequest({
        org: VALID_ORG,
        auth: basicAuth("correct-key", "correct-token"),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 401 when no Authorization header is sent", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        encrypted_credentials: encryptJson({
          account_sid: "s",
          api_key: "k",
          api_token: "t",
        }),
        provider: "exotel",
        is_active: true,
      },
    });
    const res = await POST(makeRequest({ org: VALID_ORG }));
    expect(res.status).toBe(401);
  });
});
