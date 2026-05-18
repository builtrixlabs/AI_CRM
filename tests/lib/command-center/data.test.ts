import { describe, expect, it } from "vitest";
import { getCommandCenterData } from "@/lib/command-center/data";

const ORG = "11111111-2222-4333-8444-555555555555";
const REP = "aaaaaaaa-2222-4333-8444-555555555555";
const OTHER = "bbbbbbbb-2222-4333-8444-555555555555";
const NOW = new Date("2026-05-14T08:00:00.000Z"); // 13:30 IST, 2026-05-14

type Row = Record<string, unknown>;

function makeClient(opts: {
  leads?: Row[];
  deals?: Row[];
  activities?: Row[];
  aq?: Array<{ status: string; decided_at: string | null }>;
  edges?: Row[];
}) {
  function nodesBuilder() {
    let nodeType = "";
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (col: string, val: string) => {
        if (col === "node_type") nodeType = val;
        return b;
      },
      is: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      then: (onF: (v: { data: unknown; error: null }) => unknown) => {
        const data =
          nodeType === "lead"
            ? (opts.leads ?? [])
            : nodeType === "deal"
              ? (opts.deals ?? [])
              : nodeType === "activity"
                ? (opts.activities ?? [])
                : [];
        return Promise.resolve({ data, error: null }).then(onF);
      },
    });
    return b;
  }
  function simpleBuilder(data: unknown) {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      is: () => b,
      then: (onF: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data, error: null }).then(onF),
    });
    return b;
  }
  function edgesBuilder(edges: Row[]) {
    const inFilters: Array<[string, unknown[]]> = [];
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      is: () => b,
      in: (col: string, vals: unknown[]) => {
        inFilters.push([col, vals]);
        return b;
      },
      then: (onF: (v: { data: unknown; error: null }) => unknown) => {
        let rows = edges;
        for (const [col, vals] of inFilters) {
          rows = rows.filter((r) => vals.includes(r[col]));
        }
        return Promise.resolve({ data: rows, error: null }).then(onF);
      },
    });
    return b;
  }
  return {
    from: (table: string) => {
      if (table === "nodes") return nodesBuilder();
      if (table === "agent_approval_queue") return simpleBuilder(opts.aq ?? []);
      if (table === "edges") return edgesBuilder(opts.edges ?? []);
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function lead(over: Row): Row {
  return {
    id: over.id ?? "lead-x",
    state: over.state ?? "new",
    data: over.data ?? {},
    created_by: over.created_by ?? OTHER,
    created_at: over.created_at ?? "2026-05-14T06:00:00.000Z",
    ...over,
  };
}

describe("getCommandCenterData — scope", () => {
  it("a manager gets the org rollup (scope=org, all leads)", async () => {
    const client = makeClient({
      leads: [
        lead({ id: "l1", created_by: REP }),
        lead({ id: "l2", created_by: OTHER }),
      ],
    });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "manager" },
      client as never,
      NOW,
    );
    expect(d.scope).toBe("org");
    expect(d.kpis.active_leads).toBe(2);
    expect(d.has_any_data).toBe(true);
  });

  it("a sales_rep gets only leads they own (scope=personal)", async () => {
    const client = makeClient({
      leads: [
        lead({ id: "mine-created", created_by: REP }),
        lead({
          id: "mine-assigned",
          created_by: OTHER,
          data: { assigned_sales_rep_id: REP },
        }),
        lead({ id: "theirs", created_by: OTHER }),
      ],
    });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "sales_rep" },
      client as never,
      NOW,
    );
    expect(d.scope).toBe("personal");
    expect(d.kpis.active_leads).toBe(2);
    expect(d.states.reduce((s, x) => s + x.count, 0)).toBe(2);
  });

  it("has_any_data is false for an org with no leads in scope", async () => {
    const client = makeClient({ leads: [] });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "org_admin" },
      client as never,
      NOW,
    );
    expect(d.has_any_data).toBe(false);
  });
});

describe("getCommandCenterData — KPI math", () => {
  it("computes active_leads, hot_pipeline, avg_intent, closed_mtd", async () => {
    const client = makeClient({
      leads: [
        lead({ id: "a", state: "new", data: { intent_score: 80 } }),
        lead({ id: "b", state: "contacted", data: { intent_score: 60 } }),
        lead({ id: "c", state: "qualified", data: { intent_score: 90 } }),
        lead({ id: "d", state: "lost", data: { intent_score: 20 } }),
      ],
      deals: [
        {
          id: "deal-1",
          state: "booked",
          data: {},
          created_by: OTHER,
          updated_at: "2026-05-10T00:00:00.000Z",
        },
        {
          id: "deal-2",
          state: "booked",
          data: {},
          created_by: OTHER,
          updated_at: "2026-04-10T00:00:00.000Z", // last month — excluded
        },
        {
          id: "deal-3",
          state: "qualified",
          data: {},
          created_by: OTHER,
          updated_at: "2026-05-12T00:00:00.000Z", // not booked — excluded
        },
      ],
    });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "org_admin" },
      client as never,
      NOW,
    );
    expect(d.kpis.active_leads).toBe(3); // new + contacted + qualified
    expect(d.kpis.hot_pipeline).toBe(2); // intent >= 70: 80, 90
    expect(d.kpis.avg_intent).toBe(63); // mean(80,60,90,20) = 62.5 -> 63
    expect(d.kpis.closed_mtd).toBe(1); // only deal-1
  });

  it("avg_intent is 0 (not NaN) when no lead has an intent score", async () => {
    const client = makeClient({
      leads: [lead({ id: "a", state: "new", data: {} })],
    });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "org_admin" },
      client as never,
      NOW,
    );
    expect(d.kpis.avg_intent).toBe(0);
    expect(d.kpis.hot_pipeline).toBe(0);
  });
});

describe("getCommandCenterData — derived series", () => {
  it("buckets per-day volume for the current month", async () => {
    const client = makeClient({
      leads: [
        lead({ id: "a", created_at: "2026-05-14T06:00:00.000Z", data: { intent_score: 80 } }),
        lead({ id: "b", created_at: "2026-05-14T07:00:00.000Z", data: { intent_score: 60 } }),
        lead({ id: "c", created_at: "2026-05-13T06:00:00.000Z", data: {} }),
        lead({ id: "old", created_at: "2026-04-30T06:00:00.000Z", data: {} }),
      ],
    });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "org_admin" },
      client as never,
      NOW,
    );
    // April lead excluded; two distinct May days.
    expect(d.volume).toHaveLength(2);
    const d14 = d.volume.find((v) => v.date === "2026-05-14");
    expect(d14?.count).toBe(2);
    expect(d14?.avg_intent).toBe(70); // mean(80, 60)
  });

  it("ranks the hot leads top-5 by intent score, descending", async () => {
    const client = makeClient({
      leads: [
        lead({ id: "low", data: { intent_score: 30, name: "Low" } }),
        lead({ id: "high", data: { intent_score: 95, name: "High" } }),
        lead({ id: "mid", data: { intent_score: 60, name: "Mid" } }),
        lead({ id: "none", data: { name: "NoScore" } }),
      ],
    });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "org_admin" },
      client as never,
      NOW,
    );
    expect(d.hot_leads.map((h) => h.id)).toEqual(["high", "mid", "low"]);
    expect(d.hot_leads[0].intent_score).toBe(95);
  });

  it("summarizes the agent_approval_queue", async () => {
    const client = makeClient({
      leads: [lead({ id: "a" })],
      aq: [
        { status: "pending", decided_at: null },
        { status: "pending", decided_at: null },
        { status: "approved", decided_at: "2026-05-14T05:00:00.000Z" },
        { status: "sent", decided_at: "2026-05-14T05:00:00.000Z" },
        { status: "sent", decided_at: "2026-05-01T05:00:00.000Z" }, // not today
        { status: "rejected", decided_at: "2026-05-14T05:00:00.000Z" },
      ],
    });
    const d = await getCommandCenterData(
      { user_id: REP, organization_id: ORG, base_role: "org_admin" },
      client as never,
      NOW,
    );
    expect(d.agentic.pending).toBe(2);
    expect(d.agentic.approved).toBe(1);
    expect(d.agentic.sent_today).toBe(1);
    expect(d.agentic.rejected).toBe(1);
  });
});
