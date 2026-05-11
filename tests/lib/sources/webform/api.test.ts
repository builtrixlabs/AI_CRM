import { describe, expect, it, vi } from "vitest";

const inngestSendMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: inngestSendMock },
}));

import { ingestLead } from "@/lib/sources/webform/api";
import { hashToken } from "@/lib/sources/webform/tokens";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const ENDPOINT_ID = "33333333-4444-4555-8666-777777777777";

const VALID_TOKEN = "wf_validtokenexample_validvalue";

type Opts = {
  endpoint?: {
    id: string;
    organization_id: string;
    workspace_id: string | null;
    is_active: boolean;
    deleted_at: string | null;
  };
  workspace_id?: string | null;
  insertId?: string;
  insertError?: string;
  quarantineId?: string;
};

function makeClient(opts: Opts) {
  const inserts = [];
  const audit = [];
  const updates = [];
  function fromHandler(table) {
    if (table === "webform_endpoints") {
      return {
        select: () => {
          const filters = {};
          const chain = {};
          chain.eq = (k, v) => {
            filters[k] = v;
            return chain;
          };
          chain.is = () => chain;
          chain.maybeSingle = () => {
            // Token verification path: filter on token_hash
            if (filters.token_hash != null) {
              const r = opts.endpoint ?? null;
              return Promise.resolve({ data: r, error: null });
            }
            // received_count bump path: filter on id
            if (filters.id != null) {
              return Promise.resolve({
                data: { received_count: 5 },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          };
          return chain;
        },
        update: (payload) => {
          const chain = {};
          const filter = {};
          chain.eq = (k, v) => {
            filter[k] = v;
            return chain;
          };
          chain.then = (r) => {
            updates.push({ table, payload, filter });
            return Promise.resolve({ error: null }).then(r);
          };
          return chain;
        },
      };
    }
    if (table === "workspaces") {
      return {
        select: () => {
          const chain = {};
          chain.eq = () => chain;
          chain.is = () => chain;
          chain.order = () => chain;
          chain.limit = () => chain;
          chain.maybeSingle = () =>
            Promise.resolve({
              data: opts.workspace_id ? { id: opts.workspace_id } : null,
              error: null,
            });
          return chain;
        },
      };
    }
    if (table === "nodes") {
      return {
        insert: (payload) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: opts.insertId ?? "node-new" },
                  error: opts.insertError ? { message: opts.insertError } : null,
                }),
            }),
          };
        },
      };
    }
    if (table === "leads_quarantine") {
      return {
        insert: (payload) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: opts.quarantineId ?? "qq-new" },
                  error: null,
                }),
            }),
          };
        },
      };
    }
    if (table === "audit_log") {
      return {
        insert: (p) => {
          audit.push(p);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unhandled table: ${table}`);
  }
  return {
    inserts,
    audit,
    updates,
    client: { from: vi.fn(fromHandler) } as unknown as never,
  };
}

function activeEndpoint(over = {}) {
  return {
    id: ENDPOINT_ID,
    organization_id: ORG,
    workspace_id: WS,
    is_active: true,
    deleted_at: null,
    ...over,
  };
}

describe("ingestLead — token verification", () => {
  it("returns invalid_token when token is missing/malformed", async () => {
    const m = makeClient({});
    const r1 = await ingestLead({ token: "", payload_raw: {} }, m.client);
    expect(r1.ok).toBe(false);
    expect(r1).toMatchObject({ reason: "invalid_token" });

    const r2 = await ingestLead(
      { token: "not-a-wf-token", payload_raw: {} },
      m.client,
    );
    expect(r2).toMatchObject({ reason: "invalid_token" });
  });

  it("returns invalid_token when endpoint is inactive", async () => {
    const m = makeClient({ endpoint: activeEndpoint({ is_active: false }) });
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: { phone: "+91 99000 11111" } },
      m.client,
    );
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: "invalid_token" });
  });

  it("returns invalid_token when no row matches", async () => {
    const m = makeClient({ endpoint: undefined });
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: { phone: "+91 99000" } },
      m.client,
    );
    expect(r.ok).toBe(false);
  });
});

describe("ingestLead — happy path", () => {
  it("creates a lead with full provenance + audits + bumps endpoint", async () => {
    const m = makeClient({
      endpoint: activeEndpoint(),
      insertId: "lead-abc",
    });
    const payload = {
      phone: "+91 99000 11111",
      name: "Mr Patel",
      email: "p@example.com",
      source_campaign_id: "cam_1",
      source_ad_id: "ad_42",
      source_channel: "paid_social",
    };
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: payload },
      m.client,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead_id).toBe("lead-abc");
      expect(r.endpoint_id).toBe(ENDPOINT_ID);
    }
    const nodeInsert = m.inserts.find((i) => i.table === "nodes");
    expect(nodeInsert?.payload).toMatchObject({
      organization_id: ORG,
      workspace_id: WS,
      node_type: "lead",
      state: "new",
      label: "Mr Patel",
    });
    const ld = nodeInsert?.payload.data as Record<string, unknown>;
    expect(ld?.source).toBe("webform");
    expect(ld?.source_campaign_id).toBe("cam_1");
    expect(ld?.source_payload).toEqual(payload);
    expect(m.audit[0]).toMatchObject({ action: "lead_ingested" });
    // Endpoint bump: received_count + last_received_at written.
    const bump = m.updates.find(
      (u) => u.table === "webform_endpoints" && u.filter.id === ENDPOINT_ID,
    );
    expect(bump).toBeTruthy();
    expect((bump?.payload as Record<string, unknown>).received_count).toBe(6);
  });

  it("emits lead.created Inngest event after successful insert (D-417 AC-6)", async () => {
    inngestSendMock.mockClear();
    const m = makeClient({ endpoint: activeEndpoint(), insertId: "lead-xyz" });
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: { phone: "+91 99000 11111" } },
      m.client,
    );
    expect(r.ok).toBe(true);
    expect(inngestSendMock).toHaveBeenCalledOnce();
    expect(inngestSendMock.mock.calls[0]![0]).toEqual({
      name: "lead.created",
      data: {
        lead_id: "lead-xyz",
        organization_id: ORG,
        workspace_id: WS,
      },
    });
  });

  it("does NOT roll back the lead when inngest.send fails (best-effort)", async () => {
    inngestSendMock.mockClear();
    inngestSendMock.mockRejectedValueOnce(new Error("inngest down"));
    const m = makeClient({ endpoint: activeEndpoint(), insertId: "lead-bf" });
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: { phone: "+91 99000 11111" } },
      m.client,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lead_id).toBe("lead-bf");
    const nodeInsert = m.inserts.find((i) => i.table === "nodes");
    expect(nodeInsert).toBeTruthy();
  });

  it("does NOT emit lead.created when the payload is quarantined", async () => {
    inngestSendMock.mockClear();
    const m = makeClient({
      endpoint: activeEndpoint(),
      quarantineId: "q-x",
    });
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: { name: "no phone here" } },
      m.client,
    );
    expect(r.ok).toBe(false);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("falls back to org's first workspace when endpoint has no workspace_id", async () => {
    const m = makeClient({
      endpoint: activeEndpoint({ workspace_id: null }),
      workspace_id: "ws-fallback",
      insertId: "lead-fb",
    });
    const r = await ingestLead(
      {
        token: VALID_TOKEN,
        payload_raw: { phone: "+91 88000 22222" },
      },
      m.client,
    );
    expect(r.ok).toBe(true);
    const nodeInsert = m.inserts.find((i) => i.table === "nodes");
    expect(nodeInsert?.payload.workspace_id).toBe("ws-fallback");
  });
});

describe("ingestLead — quarantine path", () => {
  it("writes to leads_quarantine when payload fails schema", async () => {
    const m = makeClient({
      endpoint: activeEndpoint(),
      quarantineId: "q-99",
    });
    // Missing phone — required.
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: { name: "no phone" } },
      m.client,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("quarantined");
      if (r.reason === "quarantined") {
        expect(r.quarantine_id).toBe("q-99");
      }
    }
    const qIns = m.inserts.find((i) => i.table === "leads_quarantine");
    expect(qIns?.payload).toMatchObject({
      organization_id: ORG,
      source: "webform",
      webform_endpoint_id: ENDPOINT_ID,
    });
    expect(
      (qIns?.payload as { error_reason?: string }).error_reason,
    ).toContain("phone");
  });

  it("preserves the raw payload in quarantine even when it's not an object", async () => {
    const m = makeClient({
      endpoint: activeEndpoint(),
      quarantineId: "q-100",
    });
    const r = await ingestLead(
      { token: VALID_TOKEN, payload_raw: "not-an-object" },
      m.client,
    );
    expect(r.ok).toBe(false);
    const qIns = m.inserts.find((i) => i.table === "leads_quarantine");
    expect(qIns?.payload.raw_payload).toBe("not-an-object");
  });
});

describe("hashToken determinism", () => {
  it("returns the same hash for the same plaintext", () => {
    const a = hashToken("wf_test_token_value");
    const b = hashToken("wf_test_token_value");
    expect(a.equals(b)).toBe(true);
  });

  it("returns different hashes for different tokens", () => {
    const a = hashToken("wf_a");
    const b = hashToken("wf_b");
    expect(a.equals(b)).toBe(false);
  });
});
