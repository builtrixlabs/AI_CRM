import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createLead: vi.fn(),
  updateNodeData: vi.fn(),
  dispatchDirective: vi.fn(),
}));
vi.mock("@/lib/leads/api", () => ({
  createLead: mocks.createLead,
}));
vi.mock("@/lib/nodes/api", () => ({
  updateNodeData: mocks.updateNodeData,
  NodeValidationError: class extends Error {},
}));
vi.mock("@/lib/doe/runtime", () => ({
  dispatchDirective: mocks.dispatchDirective,
}));

import { listCpSubmissions, submitCpLead } from "@/lib/cp/submission";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-8888-4777-8666-555555555555";
const WS = "44444444-5555-4666-8777-888888888888";
const LEAD = "33333333-4444-4555-8666-777777777777";

function makeClient(opts: {
  workspace_rows?: Array<{ id: string }>;
  lead_rows?: Array<{
    id: string;
    created_at: string;
    state: string;
    data: Record<string, unknown>;
  }>;
}) {
  const wsChain = {
    select: vi.fn(() => wsChain),
    eq: vi.fn(() => wsChain),
    is: vi.fn(() => wsChain),
    order: vi.fn(() => wsChain),
    limit: vi.fn(() =>
      Promise.resolve({ data: opts.workspace_rows ?? [], error: null })
    ),
  };
  const nodesChain = {
    select: vi.fn(() => nodesChain),
    eq: vi.fn(() => nodesChain),
    is: vi.fn(() => nodesChain),
    order: vi.fn(() => nodesChain),
    limit: vi.fn(() =>
      Promise.resolve({ data: opts.lead_rows ?? [], error: null })
    ),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "workspaces") return wsChain;
      if (table === "nodes") return nodesChain;
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

beforeEach(() => {
  mocks.createLead.mockReset();
  mocks.createLead.mockResolvedValue({ id: LEAD });
  mocks.updateNodeData.mockReset();
  mocks.updateNodeData.mockResolvedValue(undefined);
  mocks.dispatchDirective.mockReset();
  mocks.dispatchDirective.mockResolvedValue([]);
});

describe("submitCpLead", () => {
  it("creates a lead, attaches CP custom fields, dispatches DOE", async () => {
    const client = makeClient({ workspace_rows: [{ id: WS }] });
    const result = await submitCpLead(
      {
        organization_id: ORG,
        user_id: USER,
        phone: "+91 98123 45678",
        email: "lead@example.com",
        source_property: "Skyline Towers Phase 2",
        expected_budget: "₹50L–₹70L",
        notes: "Looking for 3BHK",
      },
      client as never
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead_node_id).toBe(LEAD);

    expect(mocks.createLead).toHaveBeenCalledTimes(1);
    const cArg = mocks.createLead.mock.calls[0][0];
    expect(cArg.workspace_id).toBe(WS);
    expect(cArg.created_by).toBe(USER);
    expect(cArg.data.source).toBe("channel_partner");
    expect(cArg.data.phone).toBe("+91 98123 45678");

    expect(mocks.updateNodeData).toHaveBeenCalledTimes(1);
    const uArg = mocks.updateNodeData.mock.calls[0][0];
    expect(uArg.id).toBe(LEAD);
    expect(uArg.updated_via).toBe("cp_portal");
    const custom = uArg.partial.custom as Record<string, unknown>;
    expect(custom.cp_submitted_by).toBe(USER);
    expect(custom.cp_status).toBe("pending");
    expect(custom.source_property).toBe("Skyline Towers Phase 2");
    expect(custom.expected_budget).toBe("₹50L–₹70L");

    expect(mocks.dispatchDirective).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDirective.mock.calls[0][0].kind).toBe(
      "cp.lead_submitted"
    );
  });

  it("returns no_workspace when org has none", async () => {
    const client = makeClient({ workspace_rows: [] });
    const result = await submitCpLead(
      { organization_id: ORG, user_id: USER, phone: "9812345678" },
      client as never
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("no_workspace");
    expect(mocks.createLead).not.toHaveBeenCalled();
  });

  it("returns internal error when createLead throws", async () => {
    mocks.createLead.mockRejectedValueOnce(new Error("boom"));
    const client = makeClient({ workspace_rows: [{ id: WS }] });
    const result = await submitCpLead(
      { organization_id: ORG, user_id: USER, phone: "9812345678" },
      client as never
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("internal");
    expect(result.message).toBe("boom");
  });

  it("doesn't fail submission if DOE dispatch hiccups", async () => {
    mocks.dispatchDirective.mockRejectedValueOnce(new Error("doe down"));
    const client = makeClient({ workspace_rows: [{ id: WS }] });
    const result = await submitCpLead(
      { organization_id: ORG, user_id: USER, phone: "9812345678" },
      client as never
    );
    expect(result.ok).toBe(true);
  });
});

describe("listCpSubmissions", () => {
  it("returns rows for caller, mapped to CpSubmissionRow shape", async () => {
    const client = makeClient({
      lead_rows: [
        {
          id: LEAD,
          created_at: "2026-05-09T10:00:00.000Z",
          state: "new",
          data: {
            phone: "+91 98123 45678",
            custom: {
              cp_submitted_by: USER,
              cp_status: "pending",
              source_property: "Skyline 2",
              expected_budget: "₹60L",
            },
          },
        },
      ],
    });
    const rows = await listCpSubmissions(ORG, USER, client as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe("+91 98123 45678");
    expect(rows[0].cp_status).toBe("pending");
    expect(rows[0].source_property).toBe("Skyline 2");
    expect(rows[0].state).toBe("new");
  });

  it("defaults cp_status to 'pending' when unset", async () => {
    const client = makeClient({
      lead_rows: [
        {
          id: LEAD,
          created_at: "2026-05-09T10:00:00.000Z",
          state: "qualified",
          data: { phone: "9812345678", custom: {} },
        },
      ],
    });
    const rows = await listCpSubmissions(ORG, USER, client as never);
    expect(rows[0].cp_status).toBe("pending");
  });

  it("returns empty array on db error", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(() =>
          Promise.resolve({ data: null, error: new Error("x") })
        ),
      })),
    };
    const rows = await listCpSubmissions(ORG, USER, client as never);
    expect(rows).toEqual([]);
  });
});
