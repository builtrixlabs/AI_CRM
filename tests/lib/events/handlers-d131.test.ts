import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  dispatchDirective: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  updateNodeData: mocks.updateNodeData,
  NodeValidationError: class extends Error {},
}));
vi.mock("@/lib/doe/runtime", () => ({
  dispatchDirective: mocks.dispatchDirective,
}));

import { onBantExtracted } from "@/lib/events/call-audit/onBantExtracted";
import { onLeadIntentChanged } from "@/lib/events/call-audit/onLeadIntentChanged";
import { onCallComplianceFlag } from "@/lib/events/call-audit/onCallComplianceFlag";
import { onCallNextBestAction } from "@/lib/events/call-audit/onCallNextBestAction";
import type { BuiltrixEvent } from "@/lib/events/types";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const CALL = "44444444-5555-4666-8777-888888888888";

function makeClient(opts: {
  tenant_lead?: { workspace_id: string } | null;
  lead_data?: Record<string, unknown>;
  intent_dup?: boolean;
}) {
  const inserts = {
    audit: [] as unknown[],
    node_signals: [] as unknown[],
  };

  const intentChain = {
    select: vi.fn(() => intentChain),
    eq: vi.fn(() => intentChain),
    limit: vi.fn(() =>
      Promise.resolve({
        data: opts.intent_dup ? [{ id: "existing-signal" }] : [],
        error: null,
      })
    ),
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
      if (table === "node_signals") {
        // Tests covering "already exists" path use intentChain (.select().eq()...limit()).
        // Tests writing the row use .insert (returns same chainable).
        return Object.assign(intentChain, {
          insert: vi.fn((row: unknown) => {
            inserts.node_signals.push(row);
            return Promise.resolve({ error: null });
          }),
        });
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

const baseEnv = (event_kind: string, payload: Record<string, unknown>): BuiltrixEvent => ({
  event_id: "evt-d131-1",
  organization_id: ORG,
  event_kind,
  source_product: "voice_iq",
  ts: "2026-05-09T12:00:00.000Z",
  payload,
});

beforeEach(() => {
  mocks.updateNodeData.mockReset();
  mocks.updateNodeData.mockResolvedValue(undefined);
  mocks.dispatchDirective.mockReset();
  mocks.dispatchDirective.mockResolvedValue([]);
});

describe("onBantExtracted (D-131)", () => {
  it("lifts BANT to lead.data.custom.bant.ai and dispatches DOE", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: { custom: { other: 1 } },
    });
    const env = baseEnv("call.bant_extracted", {
      lead_id: LEAD,
      workspace_id: WS,
      call_id: CALL,
      bant: { score: 84, budget: "₹70L", timeline: "60d" },
    });
    const result = await onBantExtracted(env, { client: client as never });
    expect(result.ok).toBe(true);

    expect(mocks.updateNodeData).toHaveBeenCalledTimes(1);
    const partial = mocks.updateNodeData.mock.calls[0][0].partial as {
      custom: Record<string, unknown>;
    };
    expect(partial.custom.other).toBe(1);
    const bant = partial.custom.bant as Record<string, unknown>;
    const ai = bant.ai as Record<string, unknown>;
    expect(ai.score).toBe(84);
    expect(ai.observed_at).toBe(env.ts);

    expect(inserts.audit).toHaveLength(1);
    expect((inserts.audit[0] as { action: string }).action).toBe("bant_extracted");

    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(1);
    const trig = mocks.dispatchDirective.mock.calls[0][0];
    expect(trig.kind).toBe("call.bant_extracted");
    expect(trig.payload.score).toBe(84);
  });

  it("rejects cross-tenant lead", async () => {
    const { client } = makeClient({ tenant_lead: null });
    const env = baseEnv("call.bant_extracted", {
      lead_id: LEAD,
      workspace_id: WS,
      bant: { score: 50 },
    });
    const result = await onBantExtracted(env, { client: client as never });
    expect(result.ok).toBe(false);
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
    expect(mocks.dispatchDirective).not.toHaveBeenCalled();
  });

  it("rejects malformed payload", async () => {
    const { client } = makeClient({ tenant_lead: { workspace_id: WS } });
    const env = baseEnv("call.bant_extracted", {
      lead_id: LEAD,
      bant: { score: "not-a-number" },
    });
    const result = await onBantExtracted(env, { client: client as never });
    expect(result.ok).toBe(false);
  });
});

describe("onLeadIntentChanged (D-131)", () => {
  it("inserts node_signals(intent) and dispatches DOE with score_pct", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
      intent_dup: false,
    });
    const env = baseEnv("lead.intent_changed", {
      lead_id: LEAD,
      workspace_id: WS,
      intent: { intent_capture_score: 0.82, ai_confidence: 0.91, label: "hot" },
    });
    const result = await onLeadIntentChanged(env, { client: client as never });
    expect(result.ok).toBe(true);

    expect(inserts.node_signals).toHaveLength(1);
    const row = inserts.node_signals[0] as Record<string, unknown>;
    expect(row.signal_type).toBe("intent");
    expect(row.signal_value).toBe(0.82);
    expect(row.source_event_id).toBe(env.event_id);
    expect(row.ai_confidence).toBe(0.91);

    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(1);
    const trig = mocks.dispatchDirective.mock.calls[0][0];
    expect(trig.kind).toBe("lead.intent_changed");
    // Translates 0-1 score to 0-100 so D-VIQ-02 threshold:75 fires correctly.
    expect(trig.payload.score_pct).toBe(82);
    expect(trig.payload.value).toBe(82);
  });

  it("dedups by event_id — re-POST does NOT insert a second signal row", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
      intent_dup: true,
    });
    const env = baseEnv("lead.intent_changed", {
      lead_id: LEAD,
      workspace_id: WS,
      intent: { intent_capture_score: 0.82 },
    });
    const result = await onLeadIntentChanged(env, { client: client as never });
    expect(result.ok).toBe(true);
    expect(inserts.node_signals).toHaveLength(0);
    // Audit row still written (with replay action) so observability is intact.
    expect(inserts.audit).toHaveLength(1);
    expect((inserts.audit[0] as { action: string }).action).toBe(
      "intent_changed_replay"
    );
    // DOE still fires; idempotency upstream keys on directive_invocations.trigger_id.
    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(1);
  });

  it("rejects when intent_capture_score is missing", async () => {
    const { client } = makeClient({ tenant_lead: { workspace_id: WS } });
    const env = baseEnv("lead.intent_changed", {
      lead_id: LEAD,
      workspace_id: WS,
      intent: { label: "hot" },
    });
    const result = await onLeadIntentChanged(env, { client: client as never });
    expect(result.ok).toBe(false);
  });
});

describe("onCallComplianceFlag (D-131)", () => {
  it("writes audit row and dispatches DOE for HIGH severity", async () => {
    const { client, inserts } = makeClient({ tenant_lead: { workspace_id: WS } });
    const env = baseEnv("call.compliance_flag", {
      lead_id: LEAD,
      workspace_id: WS,
      call_id: CALL,
      flag: { code: "RERA-OFF-PLAN", severity: "high", note: "x" },
    });
    const result = await onCallComplianceFlag(env, { client: client as never });
    expect(result.ok).toBe(true);

    expect(inserts.audit).toHaveLength(1);
    expect((inserts.audit[0] as { action: string }).action).toBe(
      "call_compliance_flag"
    );

    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(1);
    const trig = mocks.dispatchDirective.mock.calls[0][0];
    expect(trig.kind).toBe("call.compliance_flag");
    expect(trig.payload.severity).toBe("high");
  });

  it("does NOT dispatch DOE for low/medium severity (still audits)", async () => {
    const { client, inserts } = makeClient({ tenant_lead: { workspace_id: WS } });
    const env = baseEnv("call.compliance_flag", {
      lead_id: LEAD,
      workspace_id: WS,
      flag: { code: "PRICE-VERBAL", severity: "medium" },
    });
    const result = await onCallComplianceFlag(env, { client: client as never });
    expect(result.ok).toBe(true);
    expect(inserts.audit).toHaveLength(1);
    expect(mocks.dispatchDirective).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant", async () => {
    const { client } = makeClient({ tenant_lead: null });
    const env = baseEnv("call.compliance_flag", {
      lead_id: LEAD,
      workspace_id: WS,
      flag: { code: "X", severity: "high" },
    });
    const result = await onCallComplianceFlag(env, { client: client as never });
    expect(result.ok).toBe(false);
  });
});

describe("onCallNextBestAction (D-131)", () => {
  it("surfaces NBA on lead.data.custom.next_best_action and dispatches DOE", async () => {
    const { client, inserts } = makeClient({
      tenant_lead: { workspace_id: WS },
      lead_data: { custom: { unrelated: "preserved" } },
    });
    const env = baseEnv("call.next_best_action", {
      lead_id: LEAD,
      workspace_id: WS,
      call_id: CALL,
      nba: {
        action: "schedule_site_visit",
        rationale: "intent + budget aligned",
        ai_confidence: 0.78,
      },
    });
    const result = await onCallNextBestAction(env, { client: client as never });
    expect(result.ok).toBe(true);

    expect(mocks.updateNodeData).toHaveBeenCalledTimes(1);
    const partial = mocks.updateNodeData.mock.calls[0][0].partial as {
      custom: Record<string, unknown>;
    };
    expect(partial.custom.unrelated).toBe("preserved");
    const nba = partial.custom.next_best_action as Record<string, unknown>;
    expect(nba.action).toBe("schedule_site_visit");
    expect(nba.observed_at).toBe(env.ts);

    expect(inserts.audit).toHaveLength(1);
    expect((inserts.audit[0] as { action: string }).action).toBe(
      "next_best_action"
    );

    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(1);
    const trig = mocks.dispatchDirective.mock.calls[0][0];
    expect(trig.kind).toBe("call.next_best_action");
    expect(trig.payload.action).toBe("schedule_site_visit");
  });

  it("rejects malformed payload", async () => {
    const { client } = makeClient({ tenant_lead: { workspace_id: WS } });
    const env = baseEnv("call.next_best_action", {
      lead_id: LEAD,
      workspace_id: WS,
      nba: {},
    });
    const result = await onCallNextBestAction(env, { client: client as never });
    expect(result.ok).toBe(false);
  });
});
