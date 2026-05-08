import { describe, expect, it, vi } from "vitest";
import { getLeadCanvas, leadCanvasChannel, DEFAULT_ACTIVITY_LIMIT, ACTIVITY_EDGE_TYPES } from "@/lib/canvas/api";

const LEAD_ID = "11111111-2222-4333-8444-555555555555";
const ACTIVITY_A = "aaaaaaaa-2222-4333-8444-555555555555";
const ACTIVITY_B = "bbbbbbbb-2222-4333-8444-555555555555";

type ChainStub = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function chain(): ChainStub {
  const stub = {} as ChainStub;
  stub.select = vi.fn(() => stub);
  stub.eq = vi.fn(() => stub);
  stub.is = vi.fn(() => stub);
  stub.in = vi.fn(() => stub);
  stub.or = vi.fn(() => stub);
  stub.not = vi.fn(() => stub);
  stub.order = vi.fn(() => stub);
  stub.limit = vi.fn(() => stub);
  stub.maybeSingle = vi.fn();
  return stub;
}

const validLeadData = {
  phone: "+91-9876543210",
  email: "priya.sharma@example.com",
  source: "magicbricks" as const,
  intent_score: 87,
  notes: "3 BHK Whitefield",
};

function buildClient(opts: {
  leadResolve: { data: unknown; error: unknown };
  edgesResolve?: { data: unknown; error: unknown };
  activitiesResolve?: { data: unknown; error: unknown };
  /**
   * Optional audit rows used by post-D-009 `getLeadCanvas` to
   * derive agent_tier per activity. Default: empty.
   */
  auditTiersResolve?: { data: unknown; error: unknown };
}) {
  const leadChain = chain();
  leadChain.maybeSingle.mockResolvedValue(opts.leadResolve);

  const edgesChain = chain();
  // Edges chain resolves on awaiting the chain itself (no maybeSingle).
  Object.assign(edgesChain, {
    then: (resolve: (v: unknown) => unknown) =>
      resolve(opts.edgesResolve ?? { data: [], error: null }),
  });

  const activitiesChain = chain();
  Object.assign(activitiesChain, {
    then: (resolve: (v: unknown) => unknown) =>
      resolve(opts.activitiesResolve ?? { data: [], error: null }),
  });

  // The post-D-009 implementation also reads `audit_log` to derive
  // each activity's `agent_tier`. Provide a stub chain that resolves
  // empty so the canvas still returns the activities (with
  // agent_tier inferred from the activity row itself when present
  // — the .data activities below carry agent_tier directly so the
  // happy-path test passes).
  const auditTiersChain = chain();
  Object.assign(auditTiersChain, {
    then: (resolve: (v: unknown) => unknown) =>
      resolve(opts.auditTiersResolve ?? { data: [], error: null }),
  });

  let nodeCallIdx = 0;
  const client = {
    from: vi.fn((table: string) => {
      if (table === "edges") return edgesChain;
      if (table === "audit_log") return auditTiersChain;
      if (table === "nodes") {
        nodeCallIdx += 1;
        return nodeCallIdx === 1 ? leadChain : activitiesChain;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, leadChain, edgesChain, activitiesChain };
}

describe("ACTIVITY_EDGE_TYPES", () => {
  it("includes the three documented edge types", () => {
    expect(ACTIVITY_EDGE_TYPES).toEqual(["mentioned_in", "related_to", "belongs_to"]);
  });
});

describe("DEFAULT_ACTIVITY_LIMIT", () => {
  it("is 50 per baseline 112 contract", () => {
    expect(DEFAULT_ACTIVITY_LIMIT).toBe(50);
  });
});

describe("leadCanvasChannel (re-exported)", () => {
  it("matches the documented channel format", () => {
    expect(leadCanvasChannel(LEAD_ID)).toBe(`canvas:lead:${LEAD_ID}`);
  });
});

describe("getLeadCanvas", () => {
  it("returns lead + activities on the happy path", async () => {
    const { client } = buildClient({
      leadResolve: {
        data: {
          id: LEAD_ID,
          organization_id: "org-1",
          workspace_id: "ws-1",
          label: "Priya Sharma",
          state: "qualified",
          data: validLeadData,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-02T00:00:00Z",
          deleted_at: null,
          node_type: "lead",
        },
        error: null,
      },
      edgesResolve: {
        data: [
          { from_node_id: ACTIVITY_A, to_node_id: LEAD_ID },
          { from_node_id: LEAD_ID, to_node_id: ACTIVITY_B },
        ],
        error: null,
      },
      activitiesResolve: {
        data: [
          {
            id: ACTIVITY_B,
            organization_id: "org-1",
            workspace_id: "ws-1",
            label: "WhatsApp inbound",
            data: { kind: "whatsapp_inbound", text: "hi" },
            created_at: "2026-05-02T11:00:00Z",
            created_by: "user-1",
            created_via: "manual",
            ai_confidence: null,
            agent_tier: null,
          },
          {
            id: ACTIVITY_A,
            organization_id: "org-1",
            workspace_id: "ws-1",
            label: "Lead enrichment",
            data: { kind: "ai_extraction" },
            created_at: "2026-05-01T01:00:00Z",
            created_by: "agent-1",
            created_via: "ai_extraction",
            ai_confidence: 0.92,
            agent_tier: "T1",
          },
        ],
        error: null,
      },
      auditTiersResolve: {
        data: [{ record_id: ACTIVITY_A, agent_tier: "T1" }],
        error: null,
      },
    });

    const result = await getLeadCanvas(LEAD_ID, client as never);
    expect(result).not.toBeNull();
    expect(result!.lead.id).toBe(LEAD_ID);
    expect(result!.lead.data.phone).toBe("+91-9876543210");
    expect(result!.activities).toHaveLength(2);
    expect(result!.activities[0]!.created_at > result!.activities[1]!.created_at).toBe(true);
    expect(result!.activities[1]!.agent_tier).toBe("T1");
  });

  it("returns null for a malformed lead_id (UUID guard)", async () => {
    const { client } = buildClient({
      leadResolve: { data: null, error: null },
    });
    expect(await getLeadCanvas("not-a-uuid", client as never)).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns null when the lead row doesn't exist (or RLS hides it)", async () => {
    const { client } = buildClient({
      leadResolve: { data: null, error: null },
    });
    expect(await getLeadCanvas(LEAD_ID, client as never)).toBeNull();
  });

  it("returns null when the lead lookup errors", async () => {
    const { client } = buildClient({
      leadResolve: { data: null, error: { message: "boom" } },
    });
    expect(await getLeadCanvas(LEAD_ID, client as never)).toBeNull();
  });

  it("falls back to {} when the lead's data fails leadSchema", async () => {
    const { client } = buildClient({
      leadResolve: {
        data: {
          id: LEAD_ID,
          organization_id: "org-1",
          workspace_id: "ws-1",
          label: "Priya Sharma",
          state: "qualified",
          data: { phone: 123 }, // wrong type — schema mismatch
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          deleted_at: null,
          node_type: "lead",
        },
        error: null,
      },
    });
    const result = await getLeadCanvas(LEAD_ID, client as never);
    expect(result).not.toBeNull();
    expect(result!.lead.data).toEqual({});
  });

  it("returns lead with empty activities when no edges link to it", async () => {
    const { client } = buildClient({
      leadResolve: {
        data: {
          id: LEAD_ID,
          organization_id: "org-1",
          workspace_id: "ws-1",
          label: "Priya Sharma",
          state: "new",
          data: validLeadData,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          deleted_at: null,
          node_type: "lead",
        },
        error: null,
      },
      edgesResolve: { data: [], error: null },
    });
    const result = await getLeadCanvas(LEAD_ID, client as never);
    expect(result).not.toBeNull();
    expect(result!.activities).toEqual([]);
  });

  it("returns lead with [] activities when edge query errors", async () => {
    const { client } = buildClient({
      leadResolve: {
        data: {
          id: LEAD_ID,
          organization_id: "org-1",
          workspace_id: "ws-1",
          label: "Priya Sharma",
          state: "new",
          data: validLeadData,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          deleted_at: null,
          node_type: "lead",
        },
        error: null,
      },
      edgesResolve: { data: null, error: { message: "edge-fail" } },
    });
    const result = await getLeadCanvas(LEAD_ID, client as never);
    expect(result).not.toBeNull();
    expect(result!.activities).toEqual([]);
  });

  it("returns lead with [] when activities fetch errors", async () => {
    const { client } = buildClient({
      leadResolve: {
        data: {
          id: LEAD_ID,
          organization_id: "org-1",
          workspace_id: "ws-1",
          label: "Priya Sharma",
          state: "new",
          data: validLeadData,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          deleted_at: null,
          node_type: "lead",
        },
        error: null,
      },
      edgesResolve: {
        data: [{ from_node_id: ACTIVITY_A, to_node_id: LEAD_ID }],
        error: null,
      },
      activitiesResolve: { data: null, error: { message: "boom" } },
    });
    const result = await getLeadCanvas(LEAD_ID, client as never);
    expect(result).not.toBeNull();
    expect(result!.activities).toEqual([]);
  });

  it("coerces invalid agent_tier values to null", async () => {
    const { client } = buildClient({
      leadResolve: {
        data: {
          id: LEAD_ID,
          organization_id: "org-1",
          workspace_id: "ws-1",
          label: "Priya Sharma",
          state: "new",
          data: validLeadData,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          deleted_at: null,
          node_type: "lead",
        },
        error: null,
      },
      edgesResolve: {
        data: [{ from_node_id: ACTIVITY_A, to_node_id: LEAD_ID }],
        error: null,
      },
      activitiesResolve: {
        data: [
          {
            id: ACTIVITY_A,
            organization_id: "org-1",
            workspace_id: "ws-1",
            label: "Bad row",
            data: {},
            created_at: "2026-05-01T01:00:00Z",
            created_by: "user-1",
            created_via: "manual",
            ai_confidence: null,
            agent_tier: "TX", // invalid
          },
        ],
        error: null,
      },
      auditTiersResolve: {
        // The audit row carries a malformed tier; the canvas
        // coerces it to null per coerceTier (api.ts:27).
        data: [{ record_id: ACTIVITY_A, agent_tier: "TX" }],
        error: null,
      },
    });
    const result = await getLeadCanvas(LEAD_ID, client as never);
    expect(result!.activities[0]!.agent_tier).toBeNull();
  });
});
