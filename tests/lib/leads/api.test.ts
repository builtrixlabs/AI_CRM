import { describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: sendMock },
}));

import { createLead, transitionLead } from "@/lib/leads/api";
import { IllegalTransitionError } from "@/lib/leads/transitions";

// ── createLead — mocks D-002's createNode via the supabase client surface ──

function makeClientForCreate() {
  const insertedNodes: Record<string, unknown>[] = [];
  const insertedAudit: Record<string, unknown>[] = [];
  let returnedId = "00000000-0000-4000-8000-00000000abcd";

  const client = {
    from: vi.fn((table: string) => {
      if (table === "nodes") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedNodes.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: returnedId },
                  error: null,
                }),
              })),
            };
          }),
        };
      }
      if (table === "audit_log") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            insertedAudit.push(row);
            return { error: null };
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return {
    client,
    insertedNodes,
    insertedAudit,
    setReturnedId(id: string) {
      returnedId = id;
    },
  };
}

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const ACTOR = "33333333-4444-4555-8666-777777777777";

describe("createLead", () => {
  it("inserts a lead node with state='new' and writes one audit row", async () => {
    sendMock.mockClear();
    const t = makeClientForCreate();
    const result = await createLead(
      {
        organization_id: ORG,
        workspace_id: WS,
        created_by: ACTOR,
        data: {
          phone: "+91-9876543210",
          source: "magicbricks",
        },
      },
      t.client as never,
    );
    expect(result.id).toMatch(/[0-9a-f-]{36}/i);
    expect(t.insertedNodes).toHaveLength(1);
    const row = t.insertedNodes[0]!;
    expect(row.node_type).toBe("lead");
    expect(row.state).toBe("new");
    expect(row.organization_id).toBe(ORG);
    expect(row.workspace_id).toBe(WS);
    expect(row.created_by).toBe(ACTOR);
    expect(row.created_via).toBe("manual");
    expect(t.insertedAudit).toHaveLength(1);
    expect(t.insertedAudit[0]!.action).toBe("node_create");
  });

  it("defaults label to phone when not provided", async () => {
    const t = makeClientForCreate();
    await createLead(
      {
        organization_id: ORG,
        workspace_id: WS,
        created_by: ACTOR,
        data: { phone: "+91-9000000000", source: "walkin" },
      },
      t.client as never,
    );
    expect(t.insertedNodes[0]!.label).toBe("+91-9000000000");
  });

  it("uses provided label when present", async () => {
    const t = makeClientForCreate();
    await createLead(
      {
        organization_id: ORG,
        workspace_id: WS,
        created_by: ACTOR,
        label: "Priya Sharma",
        data: { phone: "+91-9000000000", source: "walkin" },
      },
      t.client as never,
    );
    expect(t.insertedNodes[0]!.label).toBe("Priya Sharma");
  });

  it("rejects invalid lead data via Zod (no DB write)", async () => {
    const t = makeClientForCreate();
    await expect(
      createLead(
        {
          organization_id: ORG,
          workspace_id: WS,
          created_by: ACTOR,
          data: { phone: "12", source: "walkin" }, // phone too short
        },
        t.client as never,
      ),
    ).rejects.toThrow();
    expect(t.insertedNodes).toHaveLength(0);
    expect(t.insertedAudit).toHaveLength(0);
  });

  it("emits a lead.created Inngest event after successful insert (D-009 wiring)", async () => {
    sendMock.mockClear();
    const t = makeClientForCreate();
    const result = await createLead(
      {
        organization_id: ORG,
        workspace_id: WS,
        created_by: ACTOR,
        data: { phone: "+91-9000000000", source: "walkin" },
      },
      t.client as never,
    );
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]![0]).toEqual({
      name: "lead.created",
      data: {
        lead_id: result.id,
        organization_id: ORG,
        workspace_id: WS,
      },
    });
  });

  it("does NOT roll back the lead when inngest.send fails (best-effort)", async () => {
    sendMock.mockClear();
    sendMock.mockRejectedValueOnce(new Error("inngest down"));
    const t = makeClientForCreate();
    const result = await createLead(
      {
        organization_id: ORG,
        workspace_id: WS,
        created_by: ACTOR,
        data: { phone: "+91-9000000000", source: "walkin" },
      },
      t.client as never,
    );
    expect(result.id).toBeTruthy();
    expect(t.insertedNodes).toHaveLength(1);
    expect(t.insertedAudit).toHaveLength(1);
  });
});

// ── transitionLead — mocks the SELECT + UPDATE + audit INSERT chain ──

function makeClientForTransition(opts: {
  currentRow: { state: string; organization_id: string; workspace_id: string } | null;
  updateError?: { message: string } | null;
}) {
  const updates: Record<string, unknown>[] = [];
  const auditRows: Record<string, unknown>[] = [];
  /** Records every `eq(column, value)` invocation on the SELECT chain. */
  const selectEqs: Array<[string, unknown]> = [];
  let updateError = opts.updateError ?? null;

  const buildSelectChain = () => {
    const chain = {
      eq: vi.fn((col: string, value: unknown) => {
        selectEqs.push([col, value]);
        return chain;
      }),
      is: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: opts.currentRow,
        error: null,
      }),
    };
    return chain;
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "nodes") {
        return {
          select: vi.fn(() => buildSelectChain()),
          update: vi.fn((row: Record<string, unknown>) => {
            updates.push(row);
            return {
              eq: vi.fn().mockResolvedValue({ error: updateError }),
            };
          }),
        };
      }
      if (table === "audit_log") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            auditRows.push(row);
            return { error: null };
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return {
    client,
    updates,
    auditRows,
    selectEqs,
    setUpdateError(e: { message: string }) {
      updateError = e;
    },
  };
}

describe("transitionLead", () => {
  it("happy forward transition: new → contacted, audit row has correct diff", async () => {
    const t = makeClientForTransition({
      currentRow: { state: "new", organization_id: ORG, workspace_id: WS },
    });
    await transitionLead(
      { lead_id: "11111111-2222-4333-8444-555555555555", target_state: "contacted", actor: ACTOR, caller_org_id: ORG },
      t.client as never,
    );
    expect(t.updates).toHaveLength(1);
    expect(t.updates[0]!.state).toBe("contacted");
    expect(t.updates[0]!.updated_by).toBe(ACTOR);
    expect(t.updates[0]!.updated_via).toBe("manual");
    expect(t.auditRows).toHaveLength(1);
    expect(t.auditRows[0]!.action).toBe("state_change");
    expect(t.auditRows[0]!.diff).toEqual({ from: "new", to: "contacted" });
    // Tenant gate: SELECT must filter by organization_id = caller_org_id.
    expect(t.selectEqs).toContainEqual(["organization_id", ORG]);
  });

  it("cross-tenant: caller_org_id mismatch → SELECT returns null → 'not found' (no leak)", async () => {
    // currentRow=null mocks the DB response when organization_id filter
    // excludes the lead's row.
    const t = makeClientForTransition({ currentRow: null });
    await expect(
      transitionLead(
        {
          lead_id: "11111111-2222-4333-8444-555555555555",
          target_state: "contacted",
          actor: ACTOR,
          caller_org_id: "99999999-aaaa-4bbb-8ccc-dddddddddddd",
        },
        t.client as never,
      ),
    ).rejects.toThrow(/not found/i);
    expect(t.updates).toHaveLength(0);
    expect(t.auditRows).toHaveLength(0);
    // Confirm the SELECT chain was actually filtered by the wrong org.
    expect(t.selectEqs).toContainEqual([
      "organization_id",
      "99999999-aaaa-4bbb-8ccc-dddddddddddd",
    ]);
  });

  it("terminal transition with reason adds reason to diff", async () => {
    const t = makeClientForTransition({
      currentRow: { state: "qualified", organization_id: ORG, workspace_id: WS },
    });
    await transitionLead(
      {
        lead_id: "11111111-2222-4333-8444-555555555555",
        target_state: "lost",
        actor: ACTOR,
        caller_org_id: ORG,
        reason: "duplicate of existing lead",
      },
      t.client as never,
    );
    expect(t.auditRows[0]!.diff).toEqual({
      from: "qualified",
      to: "lost",
      reason: "duplicate of existing lead",
    });
  });

  it("throws IllegalTransitionError on illegal pair (no DB write)", async () => {
    const t = makeClientForTransition({
      currentRow: { state: "lost", organization_id: ORG, workspace_id: WS },
    });
    await expect(
      transitionLead(
        { lead_id: "11111111-2222-4333-8444-555555555555", target_state: "new", actor: ACTOR },
        t.client as never,
      ),
    ).rejects.toThrow(IllegalTransitionError);
    expect(t.updates).toHaveLength(0);
    expect(t.auditRows).toHaveLength(0);
  });

  it("throws when lead_id is malformed (no DB call)", async () => {
    const t = makeClientForTransition({
      currentRow: null,
    });
    await expect(
      transitionLead(
        { lead_id: "not-a-uuid", target_state: "contacted", actor: ACTOR, caller_org_id: ORG },
        t.client as never,
      ),
    ).rejects.toThrow();
    expect(t.updates).toHaveLength(0);
  });

  it("throws when the lead is not visible (cross-tenant or missing)", async () => {
    const t = makeClientForTransition({ currentRow: null });
    await expect(
      transitionLead(
        { lead_id: "11111111-2222-4333-8444-555555555555", target_state: "contacted", actor: ACTOR, caller_org_id: ORG },
        t.client as never,
      ),
    ).rejects.toThrow(/not found/i);
    expect(t.updates).toHaveLength(0);
  });

  it("requires reason for terminal transitions", async () => {
    const t = makeClientForTransition({
      currentRow: { state: "new", organization_id: ORG, workspace_id: WS },
    });
    await expect(
      transitionLead(
        { lead_id: "11111111-2222-4333-8444-555555555555", target_state: "lost", actor: ACTOR },
        t.client as never,
      ),
    ).rejects.toThrow(/reason/i);
    expect(t.updates).toHaveLength(0);
  });

  it("propagates UPDATE error", async () => {
    const t = makeClientForTransition({
      currentRow: { state: "new", organization_id: ORG, workspace_id: WS },
      updateError: { message: "db fail" },
    });
    await expect(
      transitionLead(
        { lead_id: "11111111-2222-4333-8444-555555555555", target_state: "contacted", actor: ACTOR, caller_org_id: ORG },
        t.client as never,
      ),
    ).rejects.toThrow(/db fail/);
  });
});
