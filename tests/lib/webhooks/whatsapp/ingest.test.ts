import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNode: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  createNode: mocks.createNode,
  NodeValidationError: class extends Error {},
}));

import {
  upsertActivityFromWhatsApp,
  normalizePhone,
} from "@/lib/webhooks/whatsapp/ingest";
import type { WhatsAppInboundPayload } from "@/lib/webhooks/whatsapp/types";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const ACTIVITY = "44444444-5555-4666-8777-888888888888";
const INBOX = "55555555-6666-4777-8888-999999999999";

type Inserts = Record<string, Array<Record<string, unknown>>>;

function makeClient(opts: {
  existing_activity?: { id: string; data: Record<string, unknown> } | null;
  matching_lead?: { id: string; workspace_id: string } | null;
  default_workspace_row?: { workspace_default_id: string } | null;
  inbox_lead_id?: string | null;
}) {
  const inserts: Inserts = {
    nodes: [],
    edges: [],
    audit_log: [],
    whatsapp_inbound_log: [],
  };

  let nodesQueryCallNo = 0;

  const nodesChain = {
    select: vi.fn(() => nodesChain),
    eq: vi.fn(() => nodesChain),
    is: vi.fn(() => nodesChain),
    order: vi.fn(() => nodesChain),
    limit: vi.fn(() => {
      nodesQueryCallNo += 1;
      // Order matters: ingest first looks up the existing activity by
      // wa_message_id, then the lead by phone. We respond in that order.
      if (nodesQueryCallNo === 1) {
        return Promise.resolve(
          opts.existing_activity
            ? { data: [opts.existing_activity], error: null }
            : { data: [], error: null }
        );
      }
      return Promise.resolve(
        opts.matching_lead ? { data: [opts.matching_lead], error: null } : { data: [], error: null }
      );
    }),
    insert: vi.fn((row: Record<string, unknown>) => {
      inserts.nodes.push(row);
      return Promise.resolve({ data: null, error: null });
    }),
  };

  const endpointsChain = {
    select: vi.fn(() => endpointsChain),
    eq: vi.fn(() => endpointsChain),
    is: vi.fn(() => endpointsChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.default_workspace_row ?? null, error: null })
    ),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "nodes") return nodesChain;
      if (table === "org_whatsapp_endpoints") return endpointsChain;
      if (table === "edges") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            inserts.edges.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "audit_log") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            inserts.audit_log.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "whatsapp_inbound_log") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            inserts.whatsapp_inbound_log.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn((name: string) => {
      if (name === "ensure_workspace_inbox_lead") {
        return Promise.resolve({
          data: opts.inbox_lead_id ?? null,
          error: null,
        });
      }
      throw new Error(`Unexpected rpc ${name}`);
    }),
  };

  return { client, inserts };
}

const basePayload: WhatsAppInboundPayload = {
  wa_message_id: "wamid.abc123",
  from_phone: "+91 98765 43210",
  to_phone: "+91 80000 00001",
  body: "Looking for 3BHK in Whitefield. Reach me at priya@example.com",
  ts: "2026-05-08T10:00:00.000Z",
};

beforeEach(() => {
  mocks.createNode.mockReset();
  mocks.createNode.mockResolvedValue({ id: ACTIVITY });
});

describe("normalizePhone", () => {
  it("strips spaces, parens, dashes; preserves leading +", () => {
    expect(normalizePhone("+91 (98765) 43210")).toBe("+919876543210");
    expect(normalizePhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalizePhone("9876543210")).toBe("9876543210");
  });
  it("trims whitespace; empty input → empty output", () => {
    expect(normalizePhone("  ")).toBe("");
    expect(normalizePhone("")).toBe("");
  });
});

describe("upsertActivityFromWhatsApp — happy path (lead match)", () => {
  it("creates an activity, edge, and audit row", async () => {
    const { client, inserts } = makeClient({
      matching_lead: { id: LEAD, workspace_id: WS },
    });

    const result = await upsertActivityFromWhatsApp(
      { payload: basePayload, organization_id: ORG },
      { client: client as never }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deduped).toBe(false);
    expect(result.status).toBe("ok");
    expect(result.activity_id).toBe(ACTIVITY);
    expect(result.lead_id).toBe(LEAD);

    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    const callArg = mocks.createNode.mock.calls[0][0];
    expect(callArg.node_type).toBe("activity");
    expect(callArg.created_via).toBe("whatsapp");
    expect(callArg.data.kind).toBe("whatsapp");
    expect(callArg.data.subject_node_id).toBe(LEAD);
    expect(callArg.data.body).toContain("Whitefield");
    // PII-mask check on the summary
    expect(callArg.data.summary).toContain("[phone]");

    expect(inserts.edges).toHaveLength(1);
    expect(inserts.edges[0].edge_type).toBe("mentioned_in");
    expect(inserts.edges[0].from_node_id).toBe(ACTIVITY);
    expect(inserts.edges[0].to_node_id).toBe(LEAD);

    expect(inserts.audit_log).toHaveLength(1);
    expect(inserts.audit_log[0].action).toBe("whatsapp_inbound");
    expect(inserts.audit_log[0].actor_type).toBe("system");

    expect(inserts.whatsapp_inbound_log).toHaveLength(1);
    expect(inserts.whatsapp_inbound_log[0].status).toBe("ok");
  });
});

describe("upsertActivityFromWhatsApp — orphan (no matching lead)", () => {
  it("falls back to inbox lead and skips the edge", async () => {
    const { client, inserts } = makeClient({
      matching_lead: null,
      default_workspace_row: { workspace_default_id: WS },
      inbox_lead_id: INBOX,
    });

    const result = await upsertActivityFromWhatsApp(
      { payload: basePayload, organization_id: ORG },
      { client: client as never }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("orphan");
    expect(result.lead_id).toBe(INBOX);
    expect(result.activity_id).toBe(ACTIVITY);

    // No edge for orphan path.
    expect(inserts.edges).toHaveLength(0);

    expect(inserts.audit_log).toHaveLength(1);
    expect(
      (inserts.audit_log[0].compiled_artifact as { orphan: boolean }).orphan
    ).toBe(true);

    expect(inserts.whatsapp_inbound_log).toHaveLength(1);
    expect(inserts.whatsapp_inbound_log[0].status).toBe("orphan");
  });
});

describe("upsertActivityFromWhatsApp — dedup by wa_message_id", () => {
  it("returns deduped:true and writes no node/edge/audit", async () => {
    const { client, inserts } = makeClient({
      existing_activity: {
        id: ACTIVITY,
        data: { subject_node_id: LEAD },
      },
    });

    const result = await upsertActivityFromWhatsApp(
      { payload: basePayload, organization_id: ORG },
      { client: client as never }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deduped).toBe(true);
    expect(result.status).toBe("deduped");
    expect(result.activity_id).toBe(ACTIVITY);
    expect(result.lead_id).toBe(LEAD);

    expect(mocks.createNode).not.toHaveBeenCalled();
    expect(inserts.nodes).toHaveLength(0);
    expect(inserts.edges).toHaveLength(0);
    expect(inserts.audit_log).toHaveLength(0); // deduped never audits
    expect(inserts.whatsapp_inbound_log).toHaveLength(1);
    expect(inserts.whatsapp_inbound_log[0].status).toBe("deduped");
  });
});

describe("upsertActivityFromWhatsApp — rejection paths", () => {
  it("rejects empty wa_message_id without DB writes", async () => {
    const { client, inserts } = makeClient({});

    const result = await upsertActivityFromWhatsApp(
      {
        payload: { ...basePayload, wa_message_id: "" },
        organization_id: ORG,
      },
      { client: client as never }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("wa_message_id");
    expect(inserts.nodes).toHaveLength(0);
    // The route, not ingest, logs rejected payloads to the ledger.
  });

  it("errors when org has no default workspace and no matching lead", async () => {
    const { client, inserts } = makeClient({
      matching_lead: null,
      default_workspace_row: null,
    });

    const result = await upsertActivityFromWhatsApp(
      { payload: basePayload, organization_id: ORG },
      { client: client as never }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("error");
    expect(inserts.whatsapp_inbound_log).toHaveLength(1);
    expect(inserts.whatsapp_inbound_log[0].status).toBe("error");
  });
});
