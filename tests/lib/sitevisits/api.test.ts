import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNode: vi.fn(),
}));
vi.mock("@/lib/nodes/api", () => ({
  createNode: mocks.createNode,
  NodeValidationError: class extends Error {},
}));

import {
  createSiteVisit,
  transitionSiteVisit,
  findUpcomingSiteVisits,
} from "@/lib/sitevisits/api";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const VISIT = "44444444-5555-4666-8777-888888888888";

function makeClient(opts: {
  visit_row?: { state: string; organization_id: string; workspace_id: string } | null;
  upcoming?: Array<{
    id: string;
    organization_id: string;
    workspace_id: string;
    data: Record<string, unknown>;
  }>;
}) {
  const inserts: { edges: unknown[]; audit: unknown[] } = { edges: [], audit: [] };

  // Chainable proxy: returns itself for any method call, and is
  // thenable to resolve with the configured payload.
  type Resolved = { data: unknown; error: null };

  function makeChain(payload: Resolved) {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve(payload)),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      then: (onFulfilled: (v: Resolved) => unknown) =>
        Promise.resolve(payload).then(onFulfilled),
    });
    return chain;
  }

  // We need different payloads depending on the call:
  //   - .maybeSingle() → opts.visit_row
  //   - thenable resolution → opts.upcoming
  // The chain serves both because maybeSingle uses its own resolve.
  const upcomingPayload: Resolved = {
    data: opts.upcoming ?? [],
    error: null,
  };
  const visitRowPayload: Resolved = {
    data: opts.visit_row ?? null,
    error: null,
  };
  const visitChain = makeChain(upcomingPayload);
  // Override maybeSingle to use visit_row payload.
  (visitChain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(
    () => Promise.resolve(visitRowPayload)
  );

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
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, inserts };
}

beforeEach(() => {
  mocks.createNode.mockReset();
  mocks.createNode.mockResolvedValue({ id: VISIT });
});

describe("createSiteVisit", () => {
  it("creates the visit + edge with valid input", async () => {
    const { client, inserts } = makeClient({});
    const out = await createSiteVisit(
      {
        organization_id: ORG,
        workspace_id: WS,
        created_by: "user-1",
        lead_id: LEAD,
        scheduled_at: "2026-05-10T10:00:00.000Z",
      },
      client as never
    );
    expect(out.id).toBe(VISIT);
    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    expect(mocks.createNode.mock.calls[0][0].state).toBe("scheduled");
    expect(inserts.edges).toHaveLength(1);
    expect((inserts.edges[0] as { edge_type: string }).edge_type).toBe("attended");
  });

  it("throws on invalid scheduled_at", async () => {
    const { client } = makeClient({});
    await expect(
      createSiteVisit(
        {
          organization_id: ORG,
          workspace_id: WS,
          created_by: "user-1",
          lead_id: LEAD,
          scheduled_at: "not-a-date",
        },
        client as never
      )
    ).rejects.toThrow();
  });
});

describe("transitionSiteVisit", () => {
  it("rejects malformed id", async () => {
    const { client } = makeClient({});
    await expect(
      transitionSiteVisit(
        { id: "bad-id", target_state: "confirmed", actor: "u-1", caller_org_id: ORG },
        client as never
      )
    ).rejects.toThrow(/Malformed/);
  });

  it("requires reason for no_show", async () => {
    const { client } = makeClient({});
    await expect(
      transitionSiteVisit(
        { id: VISIT, target_state: "no_show", actor: "u-1", caller_org_id: ORG },
        client as never
      )
    ).rejects.toThrow(/Reason/);
  });

  it("happy path: scheduled → confirmed writes audit", async () => {
    const { client, inserts } = makeClient({
      visit_row: {
        state: "scheduled",
        organization_id: ORG,
        workspace_id: WS,
      },
    });
    await transitionSiteVisit(
      {
        id: VISIT,
        target_state: "confirmed",
        actor: "u-1",
        caller_org_id: ORG,
      },
      client as never
    );
    expect(inserts.audit).toHaveLength(1);
    const row = inserts.audit[0] as { action: string; diff: { from: string; to: string } };
    expect(row.action).toBe("state_change");
    expect(row.diff.from).toBe("scheduled");
    expect(row.diff.to).toBe("confirmed");
  });

  it("rejects when visit not visible (cross-tenant or missing)", async () => {
    const { client } = makeClient({ visit_row: null });
    await expect(
      transitionSiteVisit(
        { id: VISIT, target_state: "confirmed", actor: "u-1", caller_org_id: ORG },
        client as never
      )
    ).rejects.toThrow(/not found/);
  });
});

describe("findUpcomingSiteVisits", () => {
  it("returns visits whose data.scheduled_at falls in the window", async () => {
    const ts = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const { client } = makeClient({
      upcoming: [
        {
          id: VISIT,
          organization_id: ORG,
          workspace_id: WS,
          data: { scheduled_at: ts, lead_id: LEAD },
        },
      ],
    });
    const out = await findUpcomingSiteVisits(24, ORG, Date.now(), client as never);
    expect(out).toHaveLength(1);
    expect(out[0].lead_id).toBe(LEAD);
    expect(out[0].scheduled_at).toBe(ts);
  });

  it("filters out rows missing lead_id or scheduled_at", async () => {
    const { client } = makeClient({
      upcoming: [
        {
          id: VISIT,
          organization_id: ORG,
          workspace_id: WS,
          data: { scheduled_at: null },
        },
      ],
    });
    const out = await findUpcomingSiteVisits(24, ORG, Date.now(), client as never);
    expect(out).toEqual([]);
  });
});
