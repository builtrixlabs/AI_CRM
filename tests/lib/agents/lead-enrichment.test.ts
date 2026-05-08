import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  updateNodeData: mocks.updateNodeData,
  NodeValidationError: class NodeValidationError extends Error {
    constructor(public readonly issues: unknown[]) {
      super("NodeValidationError");
    }
  },
}));

import { enrichLeadHandler } from "@/lib/agents/lead-enrichment";
import type { AgentInvocation } from "@/lib/agents/types";
import type { CompleteResult } from "@/lib/ai/types";

const AGENT_ID = "00000000-0000-4000-8000-000000000aaa";
const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";

function makeClient(opts: {
  lead_row: Record<string, unknown> | null;
  audit_inserts?: Record<string, unknown>[];
}) {
  const auditInserts = opts.audit_inserts ?? [];
  const leadChain = {
    select: vi.fn(() => leadChain),
    eq: vi.fn(() => leadChain),
    is: vi.fn(() => leadChain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: opts.lead_row, error: null })),
  };
  const auditInsertChain = {
    select: vi.fn(() => auditInsertChain),
    single: vi.fn(() => Promise.resolve({ data: { id: "audit-1" }, error: null })),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "nodes") return leadChain;
      if (table === "audit_log") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            auditInserts.push(row);
            return auditInsertChain;
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, auditInserts };
}

const baseLeadRow = {
  id: LEAD,
  label: "Priya Sharma",
  state: "new",
  data: { phone: "+91-9876543210", source: "magicbricks", notes: "Wants 3BHK" },
  organization_id: ORG,
  workspace_id: WS,
  node_type: "lead",
  deleted_at: null,
};

const baseInv: AgentInvocation = {
  agent_id: AGENT_ID,
  organization_id: ORG,
  workspace_id: WS,
  action: "enrich_lead",
  attempted_tier: "T1",
  payload: { lead_id: LEAD },
};

function gatewayWithCompletion(text: string): {
  complete: (input: unknown) => Promise<CompleteResult>;
  embed: () => Promise<never>;
} {
  return {
    complete: async () =>
      ({
        ok: true,
        text,
        model_used: "claude-sonnet-4-6",
        tokens_in: 50,
        tokens_out: 25,
        duration_ms: 100,
      }) satisfies CompleteResult,
    embed: async () => {
      throw new Error("embed should not be called");
    },
  };
}

beforeEach(() => {
  mocks.updateNodeData.mockReset();
  mocks.updateNodeData.mockResolvedValue(undefined);
});

describe("enrichLead — happy path", () => {
  it("parses model JSON, updates the node with intent_score, writes one agent_action audit row", async () => {
    const t = makeClient({ lead_row: baseLeadRow });
    const gw = gatewayWithCompletion(
      JSON.stringify({ score: 72, rationale: "Magicbricks lead with budget hint." }),
    );

    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: t.client as never,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tier).toBe("T1");
      expect(r.output).toEqual({
        score: 72,
        rationale: "Magicbricks lead with budget hint.",
      });
    }
    // updateNodeData called with the partial.
    expect(mocks.updateNodeData).toHaveBeenCalledOnce();
    const args = mocks.updateNodeData.mock.calls[0]![0];
    expect(args.id).toBe(LEAD);
    expect(args.partial).toEqual({ intent_score: 72 });
    expect(args.updated_by).toBe(AGENT_ID);
    expect(args.updated_via).toBe("ai_extraction");
    // One agent_action audit row.
    expect(t.auditInserts).toHaveLength(1);
    expect(t.auditInserts[0]!.action).toBe("agent_action");
    expect(t.auditInserts[0]!.actor_type).toBe("agent");
    expect(t.auditInserts[0]!.agent_tier).toBe("T1");
    expect(t.auditInserts[0]!.prompt_version).toBe("v1");
    expect(t.auditInserts[0]!.compiled_artifact).toEqual({
      score: 72,
      rationale: "Magicbricks lead with budget hint.",
    });
  });

  it("strips Markdown fences if the model wraps JSON despite instructions", async () => {
    const t = makeClient({ lead_row: baseLeadRow });
    const gw = gatewayWithCompletion(
      "```json\n" +
        JSON.stringify({ score: 90, rationale: "walkin." }) +
        "\n```",
    );
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: t.client as never,
    });
    expect(r.ok).toBe(true);
    expect(mocks.updateNodeData).toHaveBeenCalledOnce();
  });
});

describe("enrichLead — failure paths (no node mutation)", () => {
  it("malformed JSON → audit_log action='agent_action_failed'; node untouched", async () => {
    const t = makeClient({ lead_row: baseLeadRow });
    const gw = gatewayWithCompletion("not json at all");
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: t.client as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
    expect(t.auditInserts).toHaveLength(1);
    expect(t.auditInserts[0]!.action).toBe("agent_action_failed");
  });

  it("score out of range (>100) → audit failed; node untouched", async () => {
    const t = makeClient({ lead_row: baseLeadRow });
    const gw = gatewayWithCompletion(JSON.stringify({ score: 200, rationale: "x" }));
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: t.client as never,
    });
    expect(r.ok).toBe(false);
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
    expect(t.auditInserts[0]!.action).toBe("agent_action_failed");
  });

  it("gateway error → audit_log failed; node untouched", async () => {
    const t = makeClient({ lead_row: baseLeadRow });
    const failingGateway = {
      complete: async () =>
        ({
          ok: false,
          error: "rate_limit",
          message: "429",
        }) satisfies CompleteResult,
      embed: async () => {
        throw new Error("nope");
      },
    };
    const r = await enrichLeadHandler(baseInv, {
      gateway: failingGateway as never,
      client: t.client as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("gateway");
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
    expect(t.auditInserts[0]!.action).toBe("agent_action_failed");
  });
});

describe("enrichLead — guard rails", () => {
  it("idempotent: lead already has intent_score → no gateway call, returns skipped", async () => {
    const t = makeClient({
      lead_row: {
        ...baseLeadRow,
        data: { ...(baseLeadRow.data as object), intent_score: 50 },
      },
    });
    const gw = {
      complete: vi.fn(),
      embed: vi.fn(),
    };
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: t.client as never,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.output as { skipped?: boolean }).skipped).toBe(true);
    expect(gw.complete).not.toHaveBeenCalled();
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
  });

  it("missing payload.lead_id → validation error", async () => {
    const t = makeClient({ lead_row: baseLeadRow });
    const gw = gatewayWithCompletion("{}");
    const r = await enrichLeadHandler(
      { ...baseInv, payload: {} },
      { gateway: gw as never, client: t.client as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("lead row not in tenant → validation error (defense-in-depth)", async () => {
    const t = makeClient({ lead_row: null });
    const gw = gatewayWithCompletion("{}");
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: t.client as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toContain("not found");
    }
  });

  it("missing gateway dependency → validation error", async () => {
    const t = makeClient({ lead_row: baseLeadRow });
    const r = await enrichLeadHandler(baseInv, {
      client: t.client as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("missing client dependency → validation error", async () => {
    const gw = gatewayWithCompletion("{}");
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("coerces non-string label/source/state defensively", async () => {
    // DB enforces these as strings; the agent guards against future
    // schema drift. Exercises the else-branches.
    const t = makeClient({
      lead_row: {
        ...baseLeadRow,
        label: null as unknown as string,
        state: 42 as unknown as string,
        data: { source: 123, notes: { wrong: "shape" } },
      },
    });
    const gw = gatewayWithCompletion(
      JSON.stringify({ score: 30, rationale: "unknown source." }),
    );
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: t.client as never,
    });
    expect(r.ok).toBe(true);
    expect(mocks.updateNodeData).toHaveBeenCalledOnce();
  });

  it("DB read error → unknown error path", async () => {
    const errChain = {
      select: vi.fn(() => errChain),
      eq: vi.fn(() => errChain),
      is: vi.fn(() => errChain),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: null, error: { message: "boom" } }),
      ),
    };
    const errorClient = { from: vi.fn(() => errChain) };
    const gw = gatewayWithCompletion("{}");
    const r = await enrichLeadHandler(baseInv, {
      gateway: gw as never,
      client: errorClient as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("unknown");
      expect(r.message).toContain("lead lookup failed");
    }
  });
});

describe("enrichLead convenience export", () => {
  it("dispatches via runAgent (action=enrich_lead, tier=T1 default)", async () => {
    const { enrichLead } = await import("@/lib/agents/lead-enrichment");
    // Agent lookup returns null → runAgent returns a 'not registered'
    // validation error. Confirms the convenience helper routes through
    // runAgent.
    const agentLookupChain = {
      select: vi.fn(() => agentLookupChain),
      eq: vi.fn(() => agentLookupChain),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    const client = { from: vi.fn(() => agentLookupChain) };
    const r = await enrichLead(
      {
        agent_id: AGENT_ID,
        lead_id: LEAD,
        organization_id: ORG,
        workspace_id: WS,
      },
      { client: client as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toContain("not registered");
    }
  });
});
