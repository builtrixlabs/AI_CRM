import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNode: vi.fn(),
  dispatchDirective: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  createNode: mocks.createNode,
  NodeValidationError: class extends Error {},
}));
vi.mock("@/lib/doe/runtime", () => ({
  dispatchDirective: mocks.dispatchDirective,
}));

import { onCallAudited } from "@/lib/events/call-audit/onCallAudited";
import { onCallObjectionDetected } from "@/lib/events/call-audit/onCallObjectionDetected";
import type { BuiltrixEvent } from "@/lib/events/types";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const CALL = "44444444-5555-4666-8777-888888888888";

function makeClient(opts: { tenant_lead?: { workspace_id: string } | null }) {
  const inserts: { edges: unknown[]; audit: unknown[] } = {
    edges: [],
    audit: [],
  };
  const nodesChain = {
    select: vi.fn(() => nodesChain),
    eq: vi.fn(() => nodesChain),
    is: vi.fn(() => nodesChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.tenant_lead ?? null, error: null })
    ),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "nodes") return nodesChain;
      if (table === "edges") {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.edges.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "audit_log") {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.audit.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, inserts };
}

const auditedEnvelope: BuiltrixEvent = {
  event_id: "evt-1",
  organization_id: ORG,
  event_kind: "call.audited",
  source_product: "call_audit",
  ts: "2026-05-08T10:00:00.000Z",
  payload: {
    lead_id: LEAD,
    workspace_id: WS,
    direction: "inbound",
    duration_seconds: 360,
    summary: "Discussed financing.",
    recording_url: "https://files.example.com/r1.mp3",
  },
};

const objectionEnvelope: BuiltrixEvent = {
  event_id: "evt-2",
  organization_id: ORG,
  event_kind: "call.objection_detected",
  source_product: "call_audit",
  ts: "2026-05-08T10:05:00.000Z",
  payload: {
    lead_id: LEAD,
    workspace_id: WS,
    direction: "inbound",
    duration_seconds: 180,
    summary: "Customer said price is high.",
    objection: "price",
  },
};

beforeEach(() => {
  mocks.createNode.mockReset();
  mocks.createNode.mockResolvedValue({ id: CALL });
  mocks.dispatchDirective.mockReset();
  mocks.dispatchDirective.mockResolvedValue([]);
});

describe("onCallAudited", () => {
  it("creates a call node + edge + audit row", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
    });
    const result = await onCallAudited(auditedEnvelope, {
      client: client as never,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node_id).toBe(CALL);

    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    const arg = mocks.createNode.mock.calls[0][0];
    expect(arg.node_type).toBe("call");
    expect(arg.created_via).toBe("call_audit");
    expect(arg.data.duration_seconds).toBe(360);
    expect(arg.data.custom.source_event_id).toBe("evt-1");

    expect(inserts.edges).toHaveLength(1);
    expect((inserts.edges[0] as { edge_type: string }).edge_type).toBe(
      "mentioned_in"
    );
    expect(inserts.audit).toHaveLength(1);
    expect((inserts.audit[0] as { action: string }).action).toBe(
      "event_inbound"
    );
  });

  it("rejects when payload schema mismatches", async () => {
    const { client } = makeClient({ tenant_lead: { workspace_id: WS } });
    const bad = { ...auditedEnvelope, payload: { lead_id: "not-uuid" } };
    const result = await onCallAudited(bad, { client: client as never });
    expect(result.ok).toBe(false);
  });

  it("rejects when lead is in another tenant (tenant_lead null)", async () => {
    const { client } = makeClient({ tenant_lead: null });
    const result = await onCallAudited(auditedEnvelope, {
      client: client as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not found");
  });
});

describe("onCallObjectionDetected", () => {
  it("creates the call node AND dispatches the DOE runtime", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
    });
    const result = await onCallObjectionDetected(objectionEnvelope, {
      client: client as never,
    });
    expect(result.ok).toBe(true);

    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    const arg = mocks.createNode.mock.calls[0][0];
    expect(arg.data.objection_detected).toBe("price");

    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(1);
    const trigArg = mocks.dispatchDirective.mock.calls[0][0];
    expect(trigArg.kind).toBe("call.objection_detected");
    expect(trigArg.payload.objection).toBe("price");

    expect(inserts.audit).toHaveLength(1);
    expect((inserts.audit[0] as { action: string }).action).toBe(
      "event_inbound"
    );
  });
});
