import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTeamDashboardsForViewer,
  listAssignmentsForDashboard,
  publishDashboardToTeam,
  revokeDashboardFromTeam,
} from "@/lib/dashboards/team-scoping";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const USER = "22222222-3333-4444-8555-666666666666";
const DASH = "33333333-4444-4555-8666-777777777777";
const TEAM = "44444444-5555-4666-8777-888888888888";
const TEAM2 = "55555555-6666-4777-8888-999999999999";
const ASSIGN = "66666666-7777-4888-8999-aaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
});

function tinyChain(returns: { data: unknown; error?: unknown }) {
  // The chain is itself a thenable so any `await chain` (no terminal
  // method) resolves to `returns` — matches PostgREST builder semantics.
  const resolveTo = { data: returns.data, error: returns.error ?? null };
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(resolveTo)),
    single: vi.fn(() => Promise.resolve(resolveTo)),
    maybeSingle: vi.fn(() => Promise.resolve(resolveTo)),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolveTo).then(resolve),
  };
  return chain;
}

describe("publishDashboardToTeam", () => {
  it("blocks cross-tenant: team from a different org", async () => {
    const calls: string[] = [];
    const client = {
      from: vi.fn((tbl: string) => {
        calls.push(tbl);
        if (tbl === "dashboard_definitions") {
          return tinyChain({ data: { organization_id: ORG_A }, error: null });
        }
        if (tbl === "teams") {
          return tinyChain({ data: { organization_id: ORG_B }, error: null });
        }
        throw new Error(`unexpected: ${tbl}`);
      }),
    };
    const r = await publishDashboardToTeam({
      caller_org_id: ORG_A,
      dashboard_id: DASH,
      team_id: TEAM,
      actor_id: USER,
      actor_role: "manager",
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "cross_tenant" });
  });

  it("returns 'not_found' when the dashboard does not exist", async () => {
    const client = {
      from: vi.fn((tbl: string) => {
        if (tbl === "dashboard_definitions") {
          return tinyChain({ data: null, error: null });
        }
        if (tbl === "teams") {
          return tinyChain({ data: { organization_id: ORG_A }, error: null });
        }
        throw new Error(`unexpected: ${tbl}`);
      }),
    };
    const r = await publishDashboardToTeam({
      caller_org_id: ORG_A,
      dashboard_id: DASH,
      team_id: TEAM,
      actor_id: USER,
      actor_role: "manager",
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("inserts the row + writes an audit row on success", async () => {
    const audits: unknown[] = [];
    let fromCall = 0;
    const client = {
      from: vi.fn((tbl: string) => {
        fromCall += 1;
        if (tbl === "dashboard_definitions") {
          return tinyChain({ data: { organization_id: ORG_A }, error: null });
        }
        if (tbl === "teams") {
          return tinyChain({ data: { organization_id: ORG_A }, error: null });
        }
        if (tbl === "team_dashboard_assignments") {
          return tinyChain({ data: { id: ASSIGN }, error: null });
        }
        if (tbl === "audit_log") {
          return {
            insert: vi.fn((row: unknown) => {
              audits.push(row);
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        throw new Error(`unexpected: ${tbl} (call ${fromCall})`);
      }),
    };
    const r = await publishDashboardToTeam({
      caller_org_id: ORG_A,
      dashboard_id: DASH,
      team_id: TEAM,
      actor_id: USER,
      actor_role: "manager",
      is_default: true,
      client: client as never,
    });
    expect(r).toEqual({ ok: true, id: ASSIGN, idempotent: false });
    expect(audits).toHaveLength(1);
    const a = audits[0] as { action: string; diff: { is_default: boolean } };
    expect(a.action).toBe("dashboard_published_to_team");
    expect(a.diff.is_default).toBe(true);
  });

  it("treats 23505 (duplicate insert) as idempotent ok=true (no audit)", async () => {
    const audits: unknown[] = [];
    let dashTeamCall = 0;
    const client = {
      from: vi.fn((tbl: string) => {
        if (tbl === "dashboard_definitions") {
          return tinyChain({ data: { organization_id: ORG_A }, error: null });
        }
        if (tbl === "teams") {
          return tinyChain({ data: { organization_id: ORG_A }, error: null });
        }
        if (tbl === "team_dashboard_assignments") {
          dashTeamCall += 1;
          if (dashTeamCall === 1) {
            return tinyChain({
              data: null,
              error: { code: "23505", message: "duplicate key" },
            });
          }
          return tinyChain({ data: { id: ASSIGN }, error: null });
        }
        if (tbl === "audit_log") {
          return {
            insert: vi.fn((row: unknown) => {
              audits.push(row);
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        throw new Error(`unexpected: ${tbl}`);
      }),
    };
    const r = await publishDashboardToTeam({
      caller_org_id: ORG_A,
      dashboard_id: DASH,
      team_id: TEAM,
      actor_id: USER,
      actor_role: "manager",
      client: client as never,
    });
    expect(r).toEqual({ ok: true, id: ASSIGN, idempotent: true });
    expect(audits).toHaveLength(0);
  });
});

describe("revokeDashboardFromTeam", () => {
  it("returns 'not_found' when the assignment is missing", async () => {
    const client = {
      from: vi.fn(() => tinyChain({ data: [], error: null })),
    };
    const r = await revokeDashboardFromTeam({
      caller_org_id: ORG_A,
      assignment_id: ASSIGN,
      actor_id: USER,
      actor_role: "manager",
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns ok + writes an audit row when the delete affects 1 row", async () => {
    const audits: unknown[] = [];
    const client = {
      from: vi.fn((tbl: string) => {
        if (tbl === "team_dashboard_assignments") {
          return tinyChain({
            data: [{ id: ASSIGN, dashboard_id: DASH, team_id: TEAM }],
            error: null,
          });
        }
        if (tbl === "audit_log") {
          return {
            insert: vi.fn((row: unknown) => {
              audits.push(row);
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        throw new Error(`unexpected: ${tbl}`);
      }),
    };
    const r = await revokeDashboardFromTeam({
      caller_org_id: ORG_A,
      assignment_id: ASSIGN,
      actor_id: USER,
      actor_role: "manager",
      client: client as never,
    });
    expect(r).toEqual({ ok: true });
    expect(audits).toHaveLength(1);
    const a = audits[0] as { action: string };
    expect(a.action).toBe("dashboard_revoked_from_team");
  });
});

describe("listAssignmentsForDashboard", () => {
  it("joins team names via a batched second query", async () => {
    let fromCall = 0;
    const client = {
      from: vi.fn((tbl: string) => {
        fromCall += 1;
        if (tbl === "team_dashboard_assignments") {
          return tinyChain({
            data: [
              {
                id: ASSIGN,
                organization_id: ORG_A,
                dashboard_id: DASH,
                team_id: TEAM,
                is_default: false,
                published_at: "x",
                published_by: USER,
              },
            ],
            error: null,
          });
        }
        if (tbl === "teams") {
          return tinyChain({
            data: [{ id: TEAM, name: "Presales" }],
            error: null,
          });
        }
        throw new Error(`unexpected: ${tbl} (call ${fromCall})`);
      }),
    };
    const rows = await listAssignmentsForDashboard({
      organization_id: ORG_A,
      dashboard_id: DASH,
      client: client as never,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].team_name).toBe("Presales");
  });

  it("returns [] when no assignments", async () => {
    const client = {
      from: vi.fn(() => tinyChain({ data: [], error: null })),
    };
    const rows = await listAssignmentsForDashboard({
      organization_id: ORG_A,
      dashboard_id: DASH,
      client: client as never,
    });
    expect(rows).toEqual([]);
  });
});

describe("getTeamDashboardsForViewer", () => {
  it("returns dashboards for the viewer's teams", async () => {
    const tables: Record<string, unknown[]> = {
      team_members: [{ team_id: TEAM }, { team_id: TEAM2 }],
      team_dashboard_assignments: [
        {
          dashboard_id: DASH,
          team_id: TEAM,
          is_default: true,
          published_at: "2026-05-19T12:00:00Z",
        },
      ],
      dashboard_definitions: [{ id: DASH, name: "Presales Today" }],
      teams: [
        { id: TEAM, name: "Presales" },
        { id: TEAM2, name: "Recovery" },
      ],
    };
    const client = {
      from: vi.fn((tbl: string) =>
        tinyChain({ data: tables[tbl] ?? [], error: null }),
      ),
    };
    const r = await getTeamDashboardsForViewer({
      organization_id: ORG_A,
      user_id: USER,
      client: client as never,
    });
    expect(r).toHaveLength(1);
    expect(r[0].dashboard_name).toBe("Presales Today");
    expect(r[0].team_name).toBe("Presales");
    expect(r[0].is_default).toBe(true);
  });

  it("returns [] when viewer is in no teams", async () => {
    const client = {
      from: vi.fn(() => tinyChain({ data: [], error: null })),
    };
    const r = await getTeamDashboardsForViewer({
      organization_id: ORG_A,
      user_id: USER,
      client: client as never,
    });
    expect(r).toEqual([]);
  });
});
