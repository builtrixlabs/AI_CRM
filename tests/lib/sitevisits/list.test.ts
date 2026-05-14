import { describe, expect, it, vi } from "vitest";
import { listSiteVisits } from "@/lib/sitevisits/list";

const ORG = "11111111-2222-4333-8444-555555555555";
const REP = "aaaaaaaa-2222-4333-8444-555555555555";
const OTHER_REP = "bbbbbbbb-2222-4333-8444-555555555555";
const LEAD_1 = "cccccccc-2222-4333-8444-555555555555";
const LEAD_2 = "dddddddd-2222-4333-8444-555555555555";

type NodeRow = {
  id: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
};

/**
 * Mock Supabase client for the nodes table. The site-visit query and the
 * batched lead-label query both hit `from("nodes")`; the mock branches on
 * the select column list. Every filter method is chainable; the chain is
 * thenable so `await q` resolves.
 */
function makeClient(opts: {
  siteVisits: NodeRow[];
  leads?: Array<{ id: string; label: string }>;
}) {
  const eqCalls: Array<[string, unknown]> = [];

  function thenableChain(data: unknown) {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      eq: vi.fn((col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return chain;
      }),
      is: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      in: vi.fn(() => chain),
      then: (onF: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data, error: null }).then(onF),
    });
    return chain;
  }

  const client = {
    from: vi.fn((table: string) => {
      if (table !== "nodes") throw new Error(`unexpected table ${table}`);
      return {
        select: vi.fn((cols: string) =>
          cols === "id, label"
            ? thenableChain(opts.leads ?? [])
            : thenableChain(opts.siteVisits),
        ),
      };
    }),
  };
  return { client, eqCalls };
}

function visit(over: Partial<NodeRow> & { id: string }): NodeRow {
  return {
    id: over.id,
    state: over.state ?? "scheduled",
    data: over.data ?? { lead_id: LEAD_1, scheduled_at: "2026-05-20T06:00:00Z" },
    created_by: over.created_by ?? REP,
    created_at: over.created_at ?? "2026-05-14T00:00:00Z",
  };
}

describe("listSiteVisits — org + type scoping", () => {
  it("filters by organization_id and node_type='site_visit'", async () => {
    const { client, eqCalls } = makeClient({ siteVisits: [] });
    await listSiteVisits(
      { organization_id: ORG, viewer: { user_id: REP, base_role: "manager" } },
      client as never,
    );
    expect(eqCalls).toContainEqual(["organization_id", ORG]);
    expect(eqCalls).toContainEqual(["node_type", "site_visit"]);
  });
});

describe("listSiteVisits — role-scoped visibility (AC-4)", () => {
  const rows: NodeRow[] = [
    visit({
      id: "v-mine-assigned",
      data: {
        lead_id: LEAD_1,
        scheduled_at: "2026-05-20T06:00:00Z",
        assigned_sales_rep_id: REP,
      },
      created_by: OTHER_REP,
    }),
    visit({
      id: "v-mine-created",
      data: { lead_id: LEAD_1, scheduled_at: "2026-05-20T07:00:00Z" },
      created_by: REP,
    }),
    visit({
      id: "v-theirs",
      data: {
        lead_id: LEAD_2,
        scheduled_at: "2026-05-20T08:00:00Z",
        assigned_sales_rep_id: OTHER_REP,
      },
      created_by: OTHER_REP,
    }),
  ];

  it("a manager sees every visit in the org", async () => {
    const { client } = makeClient({ siteVisits: rows });
    const out = await listSiteVisits(
      { organization_id: ORG, viewer: { user_id: REP, base_role: "manager" } },
      client as never,
    );
    expect(out.map((r) => r.id).sort()).toEqual([
      "v-mine-assigned",
      "v-mine-created",
      "v-theirs",
    ]);
  });

  it("a sales_rep sees only visits assigned to / created by them", async () => {
    const { client } = makeClient({ siteVisits: rows });
    const out = await listSiteVisits(
      { organization_id: ORG, viewer: { user_id: REP, base_role: "sales_rep" } },
      client as never,
    );
    expect(out.map((r) => r.id).sort()).toEqual([
      "v-mine-assigned",
      "v-mine-created",
    ]);
  });

  it("a site_visit_coordinator sees every visit in the org", async () => {
    const { client } = makeClient({ siteVisits: rows });
    const out = await listSiteVisits(
      {
        organization_id: ORG,
        viewer: { user_id: REP, base_role: "site_visit_coordinator" },
      },
      client as never,
    );
    expect(out).toHaveLength(3);
  });
});

describe("listSiteVisits — IST day filter + lead labels", () => {
  it("trims the over-selected SQL window to the exact IST day", async () => {
    // 2026-05-09T19:30Z = 2026-05-10T01:00 IST → belongs to 2026-05-10.
    const { client } = makeClient({
      siteVisits: [
        visit({
          id: "v-late-eve",
          data: { lead_id: LEAD_1, scheduled_at: "2026-05-09T19:30:00Z" },
        }),
        visit({
          id: "v-midday",
          data: { lead_id: LEAD_1, scheduled_at: "2026-05-10T06:00:00Z" },
        }),
      ],
      leads: [{ id: LEAD_1, label: "Asha Rao" }],
    });
    const out = await listSiteVisits(
      {
        organization_id: ORG,
        viewer: { user_id: REP, base_role: "manager" },
        filters: { date: "2026-05-10" },
      },
      client as never,
    );
    expect(out.map((r) => r.id).sort()).toEqual(["v-late-eve", "v-midday"]);
  });

  it("joins lead labels onto the rows", async () => {
    const { client } = makeClient({
      siteVisits: [visit({ id: "v1" })],
      leads: [{ id: LEAD_1, label: "Asha Rao" }],
    });
    const out = await listSiteVisits(
      { organization_id: ORG, viewer: { user_id: REP, base_role: "manager" } },
      client as never,
    );
    expect(out[0].lead_label).toBe("Asha Rao");
    expect(out[0].lead_id).toBe(LEAD_1);
  });

  it("sorts results by scheduled_at ascending", async () => {
    const { client } = makeClient({
      siteVisits: [
        visit({
          id: "later",
          data: { lead_id: LEAD_1, scheduled_at: "2026-05-20T10:00:00Z" },
        }),
        visit({
          id: "earlier",
          data: { lead_id: LEAD_1, scheduled_at: "2026-05-20T08:00:00Z" },
        }),
      ],
    });
    const out = await listSiteVisits(
      { organization_id: ORG, viewer: { user_id: REP, base_role: "manager" } },
      client as never,
    );
    expect(out.map((r) => r.id)).toEqual(["earlier", "later"]);
  });
});
