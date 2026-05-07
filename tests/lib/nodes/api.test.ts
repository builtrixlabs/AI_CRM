import { describe, expect, it, vi } from "vitest";
import {
  createNode,
  NodeStateError,
  NodeValidationError,
  softDeleteNode,
  updateNodeData,
} from "@/lib/nodes/api";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NODE_ID = "12345678-1234-4567-8910-111213141516";

const okSelectSingle = (row: Record<string, unknown>) => ({
  data: row,
  error: null,
});

const okInsert = (id: string) => ({
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
});

const noop = () => ({ error: null });

const makeAuditRecorder = () => {
  const audit: Array<Record<string, unknown>> = [];
  const auditFrom = {
    insert: vi.fn((row: Record<string, unknown>) => {
      audit.push(row);
      return Promise.resolve({ error: null });
    }),
  };
  return { audit, auditFrom };
};

const makeClient = (handlers: {
  nodes?: ReturnType<typeof vi.fn>;
  audit_log?: ReturnType<typeof vi.fn>;
}): { client: { from: ReturnType<typeof vi.fn> }; calls: string[] } => {
  const calls: string[] = [];
  return {
    client: {
      from: vi.fn((table: string) => {
        calls.push(table);
        if (table === "nodes" && handlers.nodes) return handlers.nodes(table);
        if (table === "audit_log" && handlers.audit_log)
          return handlers.audit_log(table);
        throw new Error(`Unexpected from('${table}')`);
      }),
    },
    calls,
  };
};

describe("createNode", () => {
  it("inserts node + writes one audit row on valid input", async () => {
    const { audit, auditFrom } = makeAuditRecorder();
    const { client, calls } = makeClient({
      nodes: () => ({
        insert: () => okInsert(NODE_ID),
      }),
      audit_log: () => auditFrom,
    });

    const result = await createNode(
      {
        organization_id: ORG,
        workspace_id: WS,
        node_type: "lead",
        label: "Test Lead",
        data: { phone: "+919999900099", source: "walkin" },
        state: "new",
        created_by: USER,
      },
      client as unknown as never
    );

    expect(result.id).toBe(NODE_ID);
    expect(calls).toEqual(["nodes", "audit_log"]);
    expect(audit.length).toBe(1);
    expect(audit[0].action).toBe("node_create");
    expect(audit[0].record_id).toBe(NODE_ID);
  });

  it("throws NodeValidationError on bad data; never touches the DB", async () => {
    const { client, calls } = makeClient({});
    await expect(
      createNode(
        {
          organization_id: ORG,
          workspace_id: WS,
          node_type: "lead",
          label: "Bad",
          data: { source: "walkin" }, // missing phone
          created_by: USER,
        },
        client as unknown as never
      )
    ).rejects.toBeInstanceOf(NodeValidationError);
    expect(calls).toEqual([]); // never reached the DB
  });

  it("throws NodeStateError on invalid state", async () => {
    const { client } = makeClient({});
    await expect(
      createNode(
        {
          organization_id: ORG,
          workspace_id: WS,
          node_type: "lead",
          label: "Bad state",
          data: { phone: "+919999900099", source: "walkin" },
          state: "booked", // booked is deal, not lead
          created_by: USER,
        },
        client as unknown as never
      )
    ).rejects.toBeInstanceOf(NodeStateError);
  });
});

describe("updateNodeData", () => {
  it("merges partial, re-validates, updates, writes audit row", async () => {
    const existing = {
      id: NODE_ID,
      organization_id: ORG,
      workspace_id: WS,
      node_type: "lead",
      data: { phone: "+919999900099", source: "walkin" },
      state: "new",
    };
    const { audit, auditFrom } = makeAuditRecorder();
    const { client } = makeClient({
      nodes: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(okSelectSingle(existing)),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue(noop()) }),
      }),
      audit_log: () => auditFrom,
    });

    await updateNodeData(
      {
        id: NODE_ID,
        partial: { notes: "callback tomorrow" },
        updated_by: USER,
      },
      client as unknown as never
    );

    expect(audit.length).toBe(1);
    expect(audit[0].action).toBe("node_update");
    const diff = audit[0].diff as { before: unknown; after: unknown };
    expect(diff.before).toEqual(existing.data);
    expect(diff.after).toMatchObject({
      phone: "+919999900099",
      source: "walkin",
      notes: "callback tomorrow",
    });
  });

  it("throws NodeValidationError when merged result fails the schema", async () => {
    const existing = {
      id: NODE_ID,
      organization_id: ORG,
      workspace_id: WS,
      node_type: "lead",
      data: { phone: "+919999900099", source: "walkin" },
      state: "new",
    };
    const { client } = makeClient({
      nodes: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(okSelectSingle(existing)),
      }),
    });
    await expect(
      updateNodeData(
        {
          id: NODE_ID,
          partial: { intent_score: 999 }, // out of [0..100]
          updated_by: USER,
        },
        client as unknown as never
      )
    ).rejects.toBeInstanceOf(NodeValidationError);
  });
});

describe("softDeleteNode", () => {
  it("sets deleted_at, writes audit row, idempotent on already-deleted", async () => {
    const existing = {
      id: NODE_ID,
      organization_id: ORG,
      workspace_id: WS,
      deleted_at: null,
    };
    const { audit, auditFrom } = makeAuditRecorder();
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue(noop()) });
    const { client } = makeClient({
      nodes: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(okSelectSingle(existing)),
        update: updateMock,
      }),
      audit_log: () => auditFrom,
    });

    await softDeleteNode(
      { id: NODE_ID, deleted_by: USER, reason: "test cleanup" },
      client as unknown as never
    );

    expect(updateMock).toHaveBeenCalledOnce();
    expect(audit[0].action).toBe("node_delete");
  });

  it("idempotent: re-running on an already-deleted node is a no-op", async () => {
    const existing = {
      id: NODE_ID,
      organization_id: ORG,
      workspace_id: WS,
      deleted_at: "2026-05-07T10:00:00Z",
    };
    const updateMock = vi.fn();
    const { client } = makeClient({
      nodes: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(okSelectSingle(existing)),
        update: updateMock,
      }),
    });
    await softDeleteNode(
      { id: NODE_ID, deleted_by: USER, reason: "again" },
      client as unknown as never
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});
