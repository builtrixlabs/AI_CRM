import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNode: vi.fn(),
  updateNodeData: vi.fn(),
  dispatchDirective: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  createNode: mocks.createNode,
  updateNodeData: mocks.updateNodeData,
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

function makeClient(opts: {
  tenant_lead?: { workspace_id: string } | null;
  lead_data?: Record<string, unknown>;
}) {
  const inserts: {
    edges: unknown[];
    audit: unknown[];
    node_signals: unknown[];
  } = {
    edges: [],
    audit: [],
    node_signals: [],
  };
  const nodesChain = {
    select: vi.fn(() => nodesChain),
    eq: vi.fn(() => nodesChain),
    is: vi.fn(() => nodesChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.tenant_lead ?? null, error: null })
    ),
    single: vi.fn(() =>
      Promise.resolve({
        data: { data: opts.lead_data ?? {} },
        error: null,
      })
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
      if (table === "node_signals") {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.node_signals.push(row);
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
  mocks.updateNodeData.mockReset();
  mocks.updateNodeData.mockResolvedValue(undefined);
  mocks.dispatchDirective.mockReset();
  mocks.dispatchDirective.mockResolvedValue([]);
});

describe("onCallAudited (v1 backward compat)", () => {
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

    expect(mocks.updateNodeData).not.toHaveBeenCalled();
    expect(mocks.dispatchDirective).not.toHaveBeenCalled();
    expect(inserts.node_signals).toHaveLength(0);
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

describe("onCallAudited (v2 Voice IQ payload)", () => {
  const v2payloadCore = {
    lead_id: LEAD,
    workspace_id: WS,
    direction: "inbound" as const,
    duration_seconds: 412,
    summary: "Hot lead — wants 3BHK in Phase 2.",
    schema_version: "v2" as const,
  };

  it("AC-13: lifts BANT to lead.data.custom.bant.ai (most-recent-wins)", async () => {
    const { client } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: {
        custom: { bant: { manual: { score: 40 } }, foo: "preserved" },
      },
    });
    const env: BuiltrixEvent = {
      ...auditedEnvelope,
      source_product: "voice_iq",
      payload: {
        ...v2payloadCore,
        bant: {
          budget: "₹50L",
          authority: "self",
          need: "3BHK",
          timeline: "30d",
          score: 78,
        },
      },
    };
    const result = await onCallAudited(env, { client: client as never });
    expect(result.ok).toBe(true);

    expect(mocks.updateNodeData).toHaveBeenCalledTimes(1);
    const arg = mocks.updateNodeData.mock.calls[0][0];
    expect(arg.id).toBe(LEAD);
    expect(arg.updated_via).toBe("call_audit");
    const custom = arg.partial.custom as Record<string, unknown>;
    expect(custom.foo).toBe("preserved");
    const bant = custom.bant as Record<string, unknown>;
    expect((bant.manual as Record<string, unknown>).score).toBe(40);
    const ai = bant.ai as Record<string, unknown>;
    expect(ai.budget).toBe("₹50L");
    expect(ai.score).toBe(78);
    expect(ai.observed_at).toBe(env.ts);
    expect(ai.source_event_id).toBe(env.event_id);
  });

  it("AC-14: unions competitors_mentioned (case-insensitive dedupe)", async () => {
    const { client } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: { custom: { competitors: ["HDFC", "Sobha"] } },
    });
    const env: BuiltrixEvent = {
      ...auditedEnvelope,
      source_product: "voice_iq",
      payload: {
        ...v2payloadCore,
        competitors_mentioned: ["hdfc", "Prestige", "sobha"],
      },
    };
    await onCallAudited(env, { client: client as never });

    const arg = mocks.updateNodeData.mock.calls[0][0];
    const competitors = (arg.partial.custom as Record<string, unknown>)
      .competitors as string[];
    expect(competitors).toHaveLength(3);
    const lower = competitors.map((c) => c.toLowerCase());
    expect(lower).toContain("hdfc");
    expect(lower).toContain("sobha");
    expect(lower).toContain("prestige");
  });

  it("AC-15: creates one node_signals row when intent_capture_score present", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: { custom: {} },
    });
    const env: BuiltrixEvent = {
      ...auditedEnvelope,
      source_product: "voice_iq",
      payload: {
        ...v2payloadCore,
        intent: {
          intent_capture_score: 0.86,
          ai_confidence: 0.92,
          label: "hot",
        },
      },
    };
    await onCallAudited(env, { client: client as never });

    expect(inserts.node_signals).toHaveLength(1);
    const row = inserts.node_signals[0] as Record<string, unknown>;
    expect(row.signal_type).toBe("intent");
    expect(row.signal_value).toBe(0.86);
    expect(row.ai_confidence).toBe(0.92);
    expect(row.created_via).toBe("call_audit");
    expect(row.node_id).toBe(LEAD);
  });

  it("AC-16: dispatches one DOE per objection in objections[]", async () => {
    const { client } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: { custom: {} },
    });
    const env: BuiltrixEvent = {
      ...auditedEnvelope,
      source_product: "voice_iq",
      payload: {
        ...v2payloadCore,
        objections: [
          { text: "price too high", severity: "high" as const },
          { text: "construction timeline", severity: "medium" as const },
        ],
      },
    };
    await onCallAudited(env, { client: client as never });

    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(2);
    const first = mocks.dispatchDirective.mock.calls[0][0];
    expect(first.kind).toBe("call.objection_detected");
    expect(first.payload.objection).toBe("price too high");
    expect(first.payload.severity).toBe("high");
    expect(first.trigger_id).toContain(":0");

    const second = mocks.dispatchDirective.mock.calls[1][0];
    expect(second.payload.objection).toBe("construction timeline");
    expect(second.trigger_id).toContain(":1");
  });

  it("AC-17: writes supplementary audit row for HIGH compliance flag", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: { custom: {} },
    });
    const env: BuiltrixEvent = {
      ...auditedEnvelope,
      source_product: "voice_iq",
      payload: {
        ...v2payloadCore,
        compliance: {
          flags: [
            { code: "RERA-OFF-PLAN", severity: "high" as const, note: "x" },
            { code: "PRICE-VERBAL", severity: "medium" as const },
          ],
        },
      },
    };
    await onCallAudited(env, { client: client as never });

    // 1 base audit row + 1 supplementary HIGH row
    expect(inserts.audit).toHaveLength(2);
    const high = inserts.audit.find(
      (r) => (r as { action: string }).action === "call_compliance_flag_high"
    ) as Record<string, unknown> | undefined;
    expect(high).toBeDefined();
    const artifact = high?.compiled_artifact as Record<string, unknown>;
    const flags = artifact.flags as Array<Record<string, unknown>>;
    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe("RERA-OFF-PLAN");
  });

  it("call node carries v2 fields under data.custom", async () => {
    const { client } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: { custom: {} },
    });
    const env: BuiltrixEvent = {
      ...auditedEnvelope,
      source_product: "voice_iq",
      payload: {
        ...v2payloadCore,
        bant: { score: 78 },
        next_best_action: { action: "schedule_site_visit", ai_confidence: 0.8 },
      },
    };
    await onCallAudited(env, { client: client as never });

    const arg = mocks.createNode.mock.calls[0][0];
    expect(arg.data.custom.schema_version).toBe("v2");
    expect(arg.data.custom.bant.score).toBe(78);
    expect(arg.data.custom.next_best_action.action).toBe("schedule_site_visit");
    expect(arg.data.custom.source_event_id).toBe(env.event_id);
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
