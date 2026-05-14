import { describe, expect, it } from "vitest";
import {
  matchRule,
  allocateLead,
  type AllocationRule,
} from "@/lib/leads/allocation-engine";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const REP_A = "aaaaaaaa-4444-4555-8666-777777777777";
const REP_B = "bbbbbbbb-4444-4555-8666-777777777777";
const REP_C = "cccccccc-4444-4555-8666-777777777777";
const TEAM = "dddddddd-4444-4555-8666-777777777777";

function rule(over: Partial<AllocationRule> & { id: string }): AllocationRule {
  return {
    id: over.id,
    organization_id: ORG,
    name: over.name ?? "rule",
    priority: over.priority ?? 100,
    conditions: over.conditions ?? {},
    target_kind: over.target_kind ?? "user",
    target_user_id: over.target_user_id ?? null,
    target_team_id: over.target_team_id ?? null,
    active: over.active ?? true,
  };
}

const leadData = {
  source: "meta_lead_ads",
  source_channel: "paid_social",
  preference: { budget_band: "1.5-2Cr", city: "Bengaluru", bhk: 3 },
};

describe("matchRule — D-610 condition matching", () => {
  it("empty conditions match any lead (catch-all)", () => {
    expect(matchRule({}, { id: LEAD, data: leadData })).toBe(true);
    expect(matchRule({}, { id: LEAD, data: null })).toBe(true);
  });

  it("matches when every specified condition matches", () => {
    expect(
      matchRule(
        {
          source: "meta_lead_ads",
          source_channel: "paid_social",
          budget_band_in: ["1.5-2Cr", "2Cr+"],
          city_in: ["Bengaluru"],
          bhk_in: [2, 3],
        },
        { id: LEAD, data: leadData },
      ),
    ).toBe(true);
  });

  it("fails when any specified condition does not match", () => {
    expect(
      matchRule({ source: "99acres" }, { id: LEAD, data: leadData }),
    ).toBe(false);
    expect(
      matchRule({ source_channel: "aggregator" }, { id: LEAD, data: leadData }),
    ).toBe(false);
    expect(
      matchRule({ budget_band_in: ["under-1Cr"] }, { id: LEAD, data: leadData }),
    ).toBe(false);
    expect(
      matchRule({ bhk_in: [4, 5] }, { id: LEAD, data: leadData }),
    ).toBe(false);
  });

  it("fails a preference condition when the lead has no preference data", () => {
    expect(
      matchRule({ budget_band_in: ["1.5-2Cr"] }, { id: LEAD, data: {} }),
    ).toBe(false);
  });
});

type Row = Record<string, unknown>;

function makeClient(opts: {
  lead?: { id: string; data: Row | null } | null;
  rules?: AllocationRule[];
  teamMembers?: Record<string, string[]>;
  onLeave?: Record<string, boolean>;
  state?: Record<string, string>;
}) {
  const writes = {
    nodeUpdates: [] as Row[],
    audit: [] as Row[],
    stateUpserts: [] as Row[],
  };

  function from(table: string): Record<string, unknown> {
    if (table === "nodes") {
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        is: () => b,
        maybeSingle: () =>
          Promise.resolve({ data: opts.lead ?? null, error: null }),
        update: (patch: Row) => {
          const u: Record<string, unknown> = {};
          Object.assign(u, {
            eq: () => u,
            then: (onF: (v: { error: null }) => unknown) => {
              writes.nodeUpdates.push(patch);
              return Promise.resolve({ error: null }).then(onF);
            },
          });
          return u;
        },
      });
      return b;
    }
    if (table === "lead_allocation_rules") {
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        order: () =>
          Promise.resolve({ data: opts.rules ?? [], error: null }),
      });
      return b;
    }
    if (table === "team_members") {
      let teamId = "";
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: (col: string, val: string) => {
          if (col === "team_id") teamId = val;
          return b;
        },
        then: (onF: (v: { data: unknown; error: null }) => unknown) => {
          const ids = opts.teamMembers?.[teamId] ?? [];
          return Promise.resolve({
            data: ids.map((profile_id) => ({ profile_id })),
            error: null,
          }).then(onF);
        },
      });
      return b;
    }
    if (table === "profiles") {
      let inIds: string[] = [];
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        in: (_c: string, ids: string[]) => {
          inIds = ids;
          return b;
        },
        then: (onF: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({
            data: inIds.map((id) => ({
              id,
              on_leave: opts.onLeave?.[id] === true,
            })),
            error: null,
          }).then(onF),
      });
      return b;
    }
    if (table === "lead_allocation_state") {
      let teamId = "";
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: (col: string, val: string) => {
          if (col === "team_id") teamId = val;
          return b;
        },
        maybeSingle: () => {
          const last = opts.state?.[teamId];
          return Promise.resolve({
            data: last !== undefined ? { last_assigned_user_id: last } : null,
            error: null,
          });
        },
        upsert: (row: Row) => {
          writes.stateUpserts.push(row);
          if (opts.state) {
            opts.state[String(row.team_id)] = String(row.last_assigned_user_id);
          }
          return Promise.resolve({ error: null });
        },
      });
      return b;
    }
    if (table === "audit_log") {
      return {
        insert: (row: Row) => {
          writes.audit.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }

  return { client: { from }, writes };
}

describe("allocateLead — orchestration", () => {
  it("allocates to a matching user-target rule and writes the audit row", async () => {
    const { client, writes } = makeClient({
      lead: { id: LEAD, data: leadData },
      rules: [
        rule({
          id: "r1",
          conditions: { source_channel: "paid_social" },
          target_kind: "user",
          target_user_id: REP_A,
        }),
      ],
    });
    const r = await allocateLead(
      { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
      client as never,
    );
    expect(r).toEqual({
      ok: true,
      outcome: "allocated",
      rule_id: "r1",
      sales_rep_id: REP_A,
    });
    expect(
      (writes.nodeUpdates[0].data as Row).assigned_sales_rep_id,
    ).toBe(REP_A);
    expect(writes.audit[0].action).toBe("lead_allocated");
    expect(writes.audit[0].actor_type).toBe("system");
  });

  it("writes an unmatched audit row when no rule matches", async () => {
    const { client, writes } = makeClient({
      lead: { id: LEAD, data: leadData },
      rules: [
        rule({
          id: "r1",
          conditions: { source: "99acres" },
          target_kind: "user",
          target_user_id: REP_A,
        }),
      ],
    });
    const r = await allocateLead(
      { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
      client as never,
    );
    expect(r).toEqual({ ok: true, outcome: "unmatched" });
    expect(writes.nodeUpdates).toHaveLength(0);
    expect(writes.audit[0].action).toBe("lead_allocation_unmatched");
  });

  it("returns lead_not_found when the lead is missing / cross-org", async () => {
    const { client } = makeClient({ lead: null });
    const r = await allocateLead(
      { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
      client as never,
    );
    expect(r).toEqual({ ok: false, reason: "lead_not_found" });
  });

  it("round-robins three leads across a team to three different reps (AC-1)", async () => {
    const { client, writes } = makeClient({
      lead: { id: LEAD, data: leadData },
      rules: [
        rule({
          id: "rr",
          conditions: {},
          target_kind: "team_round_robin",
          target_team_id: TEAM,
        }),
      ],
      teamMembers: { [TEAM]: [REP_A, REP_B, REP_C] },
      onLeave: {},
      state: {},
    });
    const assigned: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await allocateLead(
        { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
        client as never,
      );
      if (r.ok && r.outcome === "allocated") assigned.push(r.sales_rep_id);
    }
    // Three distinct reps, cycling the sorted member list.
    expect(new Set(assigned).size).toBe(3);
    expect(writes.stateUpserts).toHaveLength(3);
  });

  it("skips on-leave reps in team_first_available", async () => {
    const sortedFirst = [REP_A, REP_B, REP_C].sort()[0];
    const { client } = makeClient({
      lead: { id: LEAD, data: leadData },
      rules: [
        rule({
          id: "fa",
          conditions: {},
          target_kind: "team_first_available",
          target_team_id: TEAM,
        }),
      ],
      teamMembers: { [TEAM]: [REP_A, REP_B, REP_C] },
      onLeave: { [sortedFirst]: true },
    });
    const r = await allocateLead(
      { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
      client as never,
    );
    expect(r.ok && r.outcome === "allocated").toBe(true);
    if (r.ok && r.outcome === "allocated") {
      expect(r.sales_rep_id).not.toBe(sortedFirst); // the on-leave rep is skipped
    }
  });

  it("falls through a matched rule whose team has no available rep", async () => {
    const { client, writes } = makeClient({
      lead: { id: LEAD, data: leadData },
      rules: [
        rule({
          id: "r-empty-team",
          priority: 10,
          conditions: {},
          target_kind: "team_round_robin",
          target_team_id: TEAM,
        }),
        rule({
          id: "r-fallback",
          priority: 20,
          conditions: {},
          target_kind: "user",
          target_user_id: REP_A,
        }),
      ],
      teamMembers: { [TEAM]: [] }, // empty team
    });
    const r = await allocateLead(
      { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
      client as never,
    );
    expect(r.ok && r.outcome === "allocated").toBe(true);
    if (r.ok && r.outcome === "allocated") {
      expect(r.rule_id).toBe("r-fallback"); // fell through to the next rule
      expect(r.sales_rep_id).toBe(REP_A);
    }
    expect(writes.audit[0].action).toBe("lead_allocated");
  });
});
