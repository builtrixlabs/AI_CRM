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

const NOW = "2026-05-13T10:00:00.000Z";
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
      product_kind: "post_sales_crm",
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
      product_kind: "post_sales_crm",
    });
    const otherOrg = "00000000-0000-4000-8000-0000000000ff";
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: otherOrg,
          event_kind: "post_sales.milestone_updated",
          source_product: "post_sales_crm",
          ts: NOW,
          payload: {},
        },
      }) as never,
    );
    expect(res.status).toBe(403);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("returns 403 source_product_mismatch when token=lead_sources but envelope says post_sales_crm", async () => {
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
          event_kind: "post_sales.milestone_updated",
          source_product: "post_sales_crm",
          ts: NOW,
          payload: {},
        },
      }) as never,
    );
    expect(res.status).toBe(403);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("returns 403 event_kind_not_allowed when post_sales_crm token tries to post lead.ingested", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ok: true,
      org_id: ORG,
      product_kind: "post_sales_crm",
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          event_id: "evt-12345678",
          organization_id: ORG,
          event_kind: "lead.ingested",
          source_product: "post_sales_crm",
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
      product_kind: "post_sales_crm",
    });
    const res = await POST(
      makeReq({
        auth: "Bearer good",
        body: {
          organization_id: ORG,
          event_kind: "post_sales.milestone_updated",
          source_product: "post_sales_crm",
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
      product_kind: "post_sales_crm",
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
          event_kind: "post_sales.milestone_updated",
          source_product: "post_sales_crm",
          ts: NOW,
          payload: {
            deal_id: "00000000-0000-4000-8000-000000000001",
            milestone_slug: "demand_letter_sent",
            milestone_status: "completed",
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
      product_kind: "post_sales_crm",
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
          event_kind: "post_sales.milestone_updated",
          source_product: "post_sales_crm",
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
      product_kind: "post_sales_crm",
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
          event_kind: "post_sales.milestone_updated",
          source_product: "post_sales_crm",
          ts: NOW,
          payload: {
            deal_id: "00000000-0000-4000-8000-000000000001",
            milestone_slug: "x",
            milestone_status: "completed",
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
