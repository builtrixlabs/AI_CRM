import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNode: vi.fn(),
  updateNodeData: vi.fn(),
  inngestSend: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  createNode: mocks.createNode,
  updateNodeData: mocks.updateNodeData,
  NodeValidationError: class extends Error {},
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mocks.inngestSend },
}));

import {
  surface_on_canvas,
  flag_lead,
  send_template_message,
  notify_user,
  attach_node,
  enqueue_agent,
} from "@/lib/doe/actions";
import type { DirectiveRow, Trigger } from "@/lib/doe/types";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const TARGET = "44444444-5555-4666-8777-888888888888";

function dir(p: Partial<DirectiveRow>): DirectiveRow {
  return {
    id: p.id ?? "dir-1",
    organization_id: p.organization_id ?? null,
    code: p.code ?? "D-XX",
    display_name: p.display_name ?? "test",
    trigger_kind: p.trigger_kind ?? "lead.created",
    trigger_config: p.trigger_config ?? {},
    action_kind: p.action_kind ?? "surface_on_canvas",
    action_config: p.action_config ?? {},
    tier: p.tier ?? "T0",
    enabled: p.enabled ?? true,
  };
}

function trig(p: Partial<Trigger>): Trigger {
  return {
    kind: p.kind ?? "lead.created",
    trigger_id: p.trigger_id ?? "t-1",
    organization_id: p.organization_id ?? ORG,
    workspace_id: p.workspace_id ?? WS,
    subject_node_id: "subject_node_id" in p ? p.subject_node_id! : LEAD,
    payload: p.payload ?? {},
  };
}

function makeClient() {
  const inserted: { edges: Record<string, unknown>[]; rpc: string[] } = {
    edges: [],
    rpc: [],
  };
  const insertChain = {
    select: vi.fn(() => ({
      single: vi.fn(() =>
        Promise.resolve({ data: { id: "edge-1" }, error: null })
      ),
    })),
  };
  return {
    inserted,
    client: {
      from: vi.fn((table: string) => {
        if (table === "edges") {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              inserted.edges.push(row);
              return insertChain;
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    },
  };
}

beforeEach(() => {
  mocks.createNode.mockReset();
  mocks.createNode.mockResolvedValue({ id: "node-new" });
  mocks.updateNodeData.mockReset();
  mocks.updateNodeData.mockResolvedValue(undefined);
  mocks.inngestSend.mockReset();
  mocks.inngestSend.mockResolvedValue({ ok: true });
});

describe("surface_on_canvas", () => {
  it("creates a note + edge to the subject lead", async () => {
    const { client, inserted } = makeClient();
    await surface_on_canvas(
      dir({ action_config: { kind: "playbook", title: "Price playbook" } }),
      trig({}),
      client as never
    );
    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    expect(mocks.createNode.mock.calls[0][0].node_type).toBe("note");
    expect(inserted.edges).toHaveLength(1);
    expect(inserted.edges[0].edge_type).toBe("mentioned_in");
  });

  it("skips edge insert when no subject lead", async () => {
    const { client, inserted } = makeClient();
    await surface_on_canvas(
      dir({}),
      trig({ subject_node_id: null }),
      client as never
    );
    expect(inserted.edges).toHaveLength(0);
  });
});

describe("flag_lead", () => {
  it("merges flag into the lead's data.custom", async () => {
    const { client } = makeClient();
    const result = await flag_lead(
      dir({ action_config: { flag: "stale", severity: "medium" } }),
      trig({}),
      client as never
    );
    expect(mocks.updateNodeData).toHaveBeenCalledTimes(1);
    const args = mocks.updateNodeData.mock.calls[0][0];
    expect(args.id).toBe(LEAD);
    expect(args.partial.custom.flag_stale).toBe(true);
    expect(args.partial.custom.flag_stale_severity).toBe("medium");
    expect(result.flagged).toBe(true);
  });

  it("returns event_to_emit when configured", async () => {
    const { client } = makeClient();
    const result = await flag_lead(
      dir({
        action_config: { flag: "handoff_pscrm", also_emit_event: "deal.booked" },
      }),
      trig({}),
      client as never
    );
    expect(result.event_to_emit).toBe("deal.booked");
  });

  it("throws when no subject_node_id", async () => {
    const { client } = makeClient();
    await expect(
      flag_lead(dir({}), trig({ subject_node_id: null }), client as never)
    ).rejects.toThrow();
  });
});

describe("send_template_message", () => {
  it("creates an activity stub + edge", async () => {
    const { client, inserted } = makeClient();
    const result = await send_template_message(
      dir({ action_config: { template_id: "T-12", channel: "whatsapp" } }),
      trig({}),
      client as never
    );
    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    const args = mocks.createNode.mock.calls[0][0];
    expect(args.node_type).toBe("activity");
    expect(args.data.kind).toBe("whatsapp");
    expect(args.data.custom.template_id).toBe("T-12");
    expect(result.template_id).toBe("T-12");
    expect(inserted.edges).toHaveLength(1);
  });
});

describe("notify_user", () => {
  it("creates a notification note with audience metadata", async () => {
    const { client } = makeClient();
    const result = await notify_user(
      dir({ action_config: { audience: "assigned_rep", severity: "warm" } }),
      trig({}),
      client as never
    );
    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    expect(mocks.createNode.mock.calls[0][0].data.custom.audience).toBe(
      "assigned_rep"
    );
    expect(result.created_node_id).toBe("node-new");
  });
});

describe("attach_node", () => {
  it("creates an edge when to_node_id is supplied", async () => {
    const { client, inserted } = makeClient();
    const result = await attach_node(
      dir({ action_config: { edge_type: "related_to" } }),
      trig({ payload: { to_node_id: TARGET } }),
      client as never
    );
    expect(inserted.edges).toHaveLength(1);
    expect(inserted.edges[0].to_node_id).toBe(TARGET);
    expect(result.attached).toBe(true);
  });

  it("returns attached:false when to_node_id is missing", async () => {
    const { client, inserted } = makeClient();
    const result = await attach_node(dir({}), trig({}), client as never);
    expect(result.attached).toBe(false);
    expect(inserted.edges).toHaveLength(0);
  });

  it("throws when subject_node_id is missing", async () => {
    const { client } = makeClient();
    await expect(
      attach_node(dir({}), trig({ subject_node_id: null }), client as never)
    ).rejects.toThrow();
  });
});

describe("enqueue_agent", () => {
  it("declarative skip for D-01 lead.created → lead_enrichment", async () => {
    const { client } = makeClient();
    const result = await enqueue_agent(
      dir({
        trigger_kind: "lead.created",
        action_config: { agent_type: "lead_enrichment" },
      }),
      trig({}),
      client as never
    );
    expect(result.enqueued).toBe(false);
    expect(result.reason).toContain("already-emitted");
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });
});
