import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNode: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  createNode: mocks.createNode,
  NodeValidationError: class extends Error {},
}));

import { sendReminderHandler } from "@/lib/agents/site-visit-reminder";
import type { AgentInvocation } from "@/lib/agents/types";

const AGENT_ID = "00000000-0000-4000-8000-000000000bbb";
const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const VISIT = "44444444-5555-4666-8777-888888888888";
const LEAD = "33333333-4444-4555-8666-777777777777";
const ACTIVITY = "55555555-6666-4777-8888-999999999999";

function makeClient(opts: {
  visit_row: Record<string, unknown> | null;
}) {
  const inserts: { edges: unknown[]; audit: unknown[] } = { edges: [], audit: [] };
  const visitChain = {
    select: vi.fn(() => visitChain),
    eq: vi.fn(() => visitChain),
    is: vi.fn(() => visitChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.visit_row, error: null })
    ),
  };
  const auditInsert = {
    select: vi.fn(() => ({
      single: vi.fn(() =>
        Promise.resolve({ data: { id: "audit-1" }, error: null })
      ),
    })),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "nodes") return visitChain;
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
            return auditInsert;
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, inserts };
}

const baseInv: AgentInvocation = {
  agent_id: AGENT_ID,
  organization_id: ORG,
  workspace_id: WS,
  action: "send_reminder",
  attempted_tier: "T2",
  payload: { visit_id: VISIT, hours_until: 24, template_id: "T-12" },
};

beforeEach(() => {
  mocks.createNode.mockReset();
  mocks.createNode.mockResolvedValue({ id: ACTIVITY });
});

describe("sendReminderHandler — happy path", () => {
  it("creates an activity stub + edge + audit row (T2)", async () => {
    const { client, inserts } = makeClient({
      visit_row: {
        id: VISIT,
        label: "Visit 2026-05-09",
        state: "scheduled",
        data: { scheduled_at: "2026-05-09T10:00:00.000Z", lead_id: LEAD },
        organization_id: ORG,
        workspace_id: WS,
      },
    });
    const result = await sendReminderHandler(baseInv, { client: client as never });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tier).toBe("T2");
    expect(result.audit_log_id).toBe("audit-1");

    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    const arg = mocks.createNode.mock.calls[0][0];
    expect(arg.node_type).toBe("activity");
    expect(arg.data.kind).toBe("whatsapp");
    expect(arg.data.body).toMatch(/site visit/i);

    expect(inserts.edges).toHaveLength(1);
    expect((inserts.edges[0] as { edge_type: string }).edge_type).toBe("mentioned_in");

    expect(inserts.audit).toHaveLength(1);
    const audit = inserts.audit[0] as Record<string, unknown>;
    expect(audit.actor_type).toBe("agent");
    expect(audit.agent_tier).toBe("T2");
    expect(audit.action).toBe("agent_action");
  });
});

describe("sendReminderHandler — invalid input", () => {
  it("rejects missing visit_id", async () => {
    const { client } = makeClient({ visit_row: null });
    const result = await sendReminderHandler(
      { ...baseInv, payload: {} },
      { client: client as never }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("validation");
  });

  it("rejects when visit row not found", async () => {
    const { client } = makeClient({ visit_row: null });
    const result = await sendReminderHandler(baseInv, { client: client as never });
    expect(result.ok).toBe(false);
  });

  it("rejects when visit has no lead_id", async () => {
    const { client } = makeClient({
      visit_row: {
        id: VISIT,
        label: "Visit",
        state: "scheduled",
        data: { scheduled_at: "2026-05-09T10:00:00.000Z" },
        organization_id: ORG,
        workspace_id: WS,
      },
    });
    const result = await sendReminderHandler(baseInv, { client: client as never });
    expect(result.ok).toBe(false);
  });
});

describe("sendReminderHandler — template selection", () => {
  it("uses T-13 (2h) template body", async () => {
    const { client } = makeClient({
      visit_row: {
        id: VISIT,
        label: "Visit",
        state: "scheduled",
        data: { scheduled_at: "2026-05-09T10:00:00.000Z", lead_id: LEAD },
        organization_id: ORG,
        workspace_id: WS,
      },
    });
    await sendReminderHandler(
      {
        ...baseInv,
        payload: { visit_id: VISIT, hours_until: 2, template_id: "T-13" },
      },
      { client: client as never }
    );
    const arg = mocks.createNode.mock.calls[0][0];
    expect(arg.data.body).toMatch(/2 hours|parking|map/i);
  });
});
