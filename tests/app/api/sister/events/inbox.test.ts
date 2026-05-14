import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("@/lib/auth/sister-product-auth", () => ({
  authenticateSisterProductRequest: mocks.authenticate,
}));

vi.mock("@/lib/events/inbox", () => ({
  dispatchInboxEvent: mocks.dispatch,
}));

import { POST } from "@/app/api/sister/events/inbox/route";

// V6 (implementation-order §5.5): PSCRM + Legal Auditor inbound paths are
// dropped. The events inbox keeps only the lead_sources → lead.ingested
// path, so these tests exercise that one. The sister-product auth
// middleware is mocked, so a lead_sources product_kind can still be
// simulated even though V6 issues marketing_intelligence_hub tokens only.
const NOW = "2026-05-14T10:00:00.000Z";
const ORG = "00000000-0000-4000-8000-000000000001";

function makeReq(opts: {
  body?: unknown;
  auth?: string;
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.auth) headers.authorization = opts.auth;
  return new Request("http://test/api/sister/events/inbox", {
    method: "POST",
    headers,
    body:
      opts.body === undefined
        ? "{}"
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body),
  });
}

beforeEach(() => {
  mocks.authenticate.mockReset();
  mocks.dispatch.mockReset();
});

describe("POST /api/sister/events/inbox — auth", () => {
  it("returns 401 when the auth middleware rejects", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "missing_bearer_token",
    });
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(401);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    const res = await POST(makeReq({ body: "{not json}" }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_json");
  });
});

describe("POST /api/sister/events/inbox — tenant + product gating", () => {
  it("returns 403 cross_tenant_violation when envelope org ≠ token org", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    const otherOrg = "00000000-0000-4000-8000-0000000000ff";
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: otherOrg,
          event_kind: "lead.ingested",
          source_product: "lead_sources",
          ts: NOW,
          payload: {},
        },
      }) as never,
    );
    expect(res.status).toBe(403);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("returns 403 source_product_mismatch when token=lead_sources but envelope says voice_iq", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: ORG,
          event_kind: "lead.ingested",
          source_product: "voice_iq",
          ts: NOW,
          payload: {},
        },
      }) as never,
    );
    expect(res.status).toBe(403);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("returns 403 event_kind_not_allowed when lead_sources token tries a non-lead.ingested kind", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: ORG,
          event_kind: "call.audited",
          source_product: "lead_sources",
          ts: NOW,
          payload: {},
        },
      }) as never,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("event_kind_not_allowed_for_product");
  });

  it("returns 400 missing_event_id when envelope lacks event_id", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          organization_id: ORG,
          event_kind: "lead.ingested",
          source_product: "lead_sources",
          ts: NOW,
          payload: {},
        },
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("missing_event_id");
  });
});

describe("POST /api/sister/events/inbox — happy + rejected dispatch", () => {
  it("returns 200 + dispatcher result on success", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    mocks.dispatch.mockResolvedValueOnce({
      ok: true,
      status: "ok",
      deduped: false,
      node_id: null,
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: ORG,
          event_kind: "lead.ingested",
          source_product: "lead_sources",
          ts: NOW,
          payload: {
            external_id: "mih-lead-001",
            source: "meta_lead_ads",
            captured_at: NOW,
          },
        },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.dispatch).toHaveBeenCalledOnce();
  });

  it("returns 400 when the dispatcher rejects the payload", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    mocks.dispatch.mockResolvedValueOnce({
      ok: false,
      status: "rejected",
      reason: "invalid payload",
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: ORG,
          event_kind: "lead.ingested",
          source_product: "lead_sources",
          ts: NOW,
          payload: { malformed: true },
        },
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with deduped=true on idempotent re-post", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "lead_sources",
    });
    mocks.dispatch.mockResolvedValueOnce({
      ok: true,
      status: "deduped",
      deduped: true,
      node_id: null,
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: ORG,
          event_kind: "lead.ingested",
          source_product: "lead_sources",
          ts: NOW,
          payload: {
            external_id: "mih-lead-001",
            source: "meta_lead_ads",
            captured_at: NOW,
          },
        },
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; deduped?: boolean };
    expect(body.status).toBe("deduped");
    expect(body.deduped).toBe(true);
  });
});
