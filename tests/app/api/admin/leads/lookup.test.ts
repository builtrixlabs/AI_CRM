import { describe, expect, it, vi, beforeEach } from "vitest";
import { lookupBucket } from "@/lib/auth/rate-limit";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findOrgByVoiceIqSecret: vi.fn(),
  lookupLead: vi.fn(),
  getSecret: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("@/lib/integrations/voice-iq/lookup", () => ({
  findOrgByVoiceIqSecret: mocks.findOrgByVoiceIqSecret,
  lookupLead: mocks.lookupLead,
}));
vi.mock("@/lib/secrets/getSecret", () => ({
  getSecret: mocks.getSecret,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { GET } from "@/app/api/admin/leads/lookup/route";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const WS = "44444444-5555-4666-8777-888888888888";

function makeAuditClient() {
  const audits: unknown[] = [];
  return {
    audits,
    client: {
      from: vi.fn((table: string) => {
        if (table === "audit_log") {
          return {
            insert: vi.fn((row: unknown) => {
              audits.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    },
  };
}

function buildReq(opts: {
  external_id?: string;
  phone?: string;
  org_id?: string;
  bearer?: string | null;
}): NextRequest {
  const url = new URL("http://localhost/api/admin/leads/lookup");
  if (opts.external_id) url.searchParams.set("external_id", opts.external_id);
  if (opts.phone) url.searchParams.set("phone", opts.phone);
  if (opts.org_id) url.searchParams.set("org_id", opts.org_id);
  const headers = new Headers();
  if (opts.bearer === undefined) {
    headers.set("authorization", `Bearer ${"a".repeat(64)}`);
  } else if (opts.bearer !== null) {
    headers.set("authorization", opts.bearer);
  }
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  // Default: caller's bearer matches ORG_A
  mocks.findOrgByVoiceIqSecret.mockResolvedValue(ORG_A);
  mocks.getSecret.mockResolvedValue(null);
  const aud = makeAuditClient();
  mocks.getSupabaseAdmin.mockReturnValue(aud.client);
  mocks.lookupLead.mockResolvedValue(null);
  lookupBucket._reset();
});

describe("GET /api/admin/leads/lookup", () => {
  it("400 when neither external_id nor phone provided", async () => {
    const res = await GET(buildReq({ org_id: ORG_A }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("external_id_or_phone_required");
  });

  it("400 when org_id missing or invalid", async () => {
    const res = await GET(buildReq({ external_id: "x", org_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("401 when missing Authorization header", async () => {
    const res = await GET(
      buildReq({ external_id: "x", org_id: ORG_A, bearer: null })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing_bearer");
  });

  it("401 when Bearer doesn't match any org or platform default", async () => {
    mocks.findOrgByVoiceIqSecret.mockResolvedValue(null);
    mocks.getSecret.mockResolvedValue(null);
    const res = await GET(
      buildReq({
        external_id: "x",
        org_id: ORG_A,
        bearer: `Bearer ${"z".repeat(64)}`,
      })
    );
    expect(res.status).toBe(401);
  });

  it("404 (NOT 403) when Bearer is valid for ORG_B but query asks for ORG_A — fail closed", async () => {
    mocks.findOrgByVoiceIqSecret.mockResolvedValue(ORG_B);
    const res = await GET(
      buildReq({ external_id: "x", org_id: ORG_A })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    // Confirms we don't leak that Bearer matched a different org.
  });

  it("200 with lead_node_id + workspace_id on hit", async () => {
    mocks.lookupLead.mockResolvedValue({
      lead_node_id: LEAD,
      workspace_id: WS,
    });
    const res = await GET(
      buildReq({ external_id: "voice-iq-123", org_id: ORG_A })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, lead_node_id: LEAD, workspace_id: WS });
  });

  it("404 when no lead found", async () => {
    mocks.lookupLead.mockResolvedValue(null);
    const res = await GET(
      buildReq({ phone: "+91 98123 45678", org_id: ORG_A })
    );
    expect(res.status).toBe(404);
  });

  it("audits both 200 and 404 calls", async () => {
    const aud = makeAuditClient();
    mocks.getSupabaseAdmin.mockReturnValue(aud.client);

    mocks.lookupLead.mockResolvedValueOnce({
      lead_node_id: LEAD,
      workspace_id: WS,
    });
    await GET(buildReq({ external_id: "ok-1", org_id: ORG_A }));

    mocks.lookupLead.mockResolvedValueOnce(null);
    await GET(buildReq({ external_id: "miss-1", org_id: ORG_A }));

    expect(aud.audits.length).toBe(2);
    const [hit, miss] = aud.audits as Array<Record<string, unknown>>;
    expect(hit.action).toBe("leads_lookup_read");
    expect((hit.compiled_artifact as { result_status: string }).result_status).toBe(
      "found"
    );
    expect(
      (miss.compiled_artifact as { result_status: string }).result_status
    ).toBe("not_found");
  });

  it("redacts phone in the audit log artifact", async () => {
    const aud = makeAuditClient();
    mocks.getSupabaseAdmin.mockReturnValue(aud.client);
    mocks.lookupLead.mockResolvedValue(null);
    await GET(buildReq({ phone: "9812345678", org_id: ORG_A }));
    const row = aud.audits[0] as { compiled_artifact: { query: { phone: unknown } } };
    expect(row.compiled_artifact.query.phone).toBe("<redacted>");
  });

  it("falls back to platform default secret when per-org doesn't match", async () => {
    mocks.findOrgByVoiceIqSecret.mockResolvedValue(null);
    mocks.getSecret.mockResolvedValue("a".repeat(64));
    mocks.lookupLead.mockResolvedValue({
      lead_node_id: LEAD,
      workspace_id: WS,
    });
    const res = await GET(
      buildReq({
        external_id: "voice-iq-123",
        org_id: ORG_A,
        bearer: `Bearer ${"a".repeat(64)}`,
      })
    );
    expect(res.status).toBe(200);
  });

  it("D-301 — 429 with retry-after header after 5/15min/IP exhausted", async () => {
    mocks.findOrgByVoiceIqSecret.mockResolvedValue(ORG_A);
    mocks.lookupLead.mockResolvedValue({
      lead_node_id: LEAD,
      workspace_id: WS,
    });
    const url = new URL("http://localhost/api/admin/leads/lookup");
    url.searchParams.set("external_id", "x");
    url.searchParams.set("org_id", ORG_A);
    const headers = new Headers();
    headers.set("authorization", `Bearer ${"a".repeat(64)}`);
    headers.set("x-forwarded-for", "203.0.113.99");

    const NextRequest = (await import("next/server")).NextRequest;
    for (let i = 0; i < 5; i++) {
      const res = await GET(new NextRequest(url, { headers }));
      expect(res.status).toBe(200);
    }
    const blocked = await GET(new NextRequest(url, { headers }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    const body = await blocked.json();
    expect(body.error).toBe("rate_limited");
  });
});
