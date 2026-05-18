import { describe, expect, it, vi } from "vitest";
import {
  createDashboard,
  deleteDashboard,
  getDashboard,
  listDashboards,
  updateDashboardLayout,
} from "@/lib/dashboards/admin";
import { DashboardError, type DashboardRow } from "@/lib/dashboards/types";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ACTOR = "33333333-4444-4555-8666-777777777777";

function row(over: Partial<DashboardRow> = {}): DashboardRow {
  return {
    id: "d1",
    organization_id: ORG_A,
    name: "Sales pulse",
    layout: { widgets: [{ type: "lead_count_by_state" }] },
    created_at: "2026-05-09",
    deleted_at: null,
    ...over,
  };
}

function makeClient(opts: {
  rows?: DashboardRow[];
  insert_id?: string;
  insert_error?: string;
  update_error?: string;
}) {
  const audit: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ payload: Record<string, unknown>; filter: Record<string, unknown> }> = [];

  function fromHandler(table: string) {
    if (table === "dashboard_definitions") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = (k: string, v: unknown) => {
            filters[`${k}_is`] = v;
            return chain;
          };
          chain.order = () => chain;
          chain.maybeSingle = () => {
            const r = (opts.rows ?? []).find(
              (x) =>
                x.id === filters.id &&
                x.organization_id === filters.organization_id,
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            const filtered = (opts.rows ?? []).filter(
              (x) => x.organization_id === filters.organization_id,
            );
            return Promise.resolve({ data: filtered, error: null }).then(
              resolve,
            );
          };
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: opts.insert_id ?? "new" },
                  error: opts.insert_error ? { message: opts.insert_error } : null,
                }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          const filter: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filter[k] = v;
            return chain;
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            updates.push({ payload, filter });
            return Promise.resolve({
              error: opts.update_error ? { message: opts.update_error } : null,
            }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "audit_log") {
      return {
        insert: (payload: Record<string, unknown>) => {
          audit.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unhandled: ${table}`);
  }

  return {
    audit,
    inserts,
    updates,
    client: { from: vi.fn(fromHandler) } as unknown as Parameters<typeof createDashboard>[1],
  };
}

describe("listDashboards", () => {
  it("filters by organization_id", async () => {
    const m = makeClient({
      rows: [row({ id: "a" }), row({ id: "b", organization_id: ORG_B })],
    });
    const result = await listDashboards(ORG_A, m.client);
    expect(result.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("getDashboard", () => {
  it("returns the row when in own org", async () => {
    const m = makeClient({ rows: [row({ id: "a" })] });
    const r = await getDashboard(ORG_A, "a", m.client);
    expect(r?.id).toBe("a");
  });

  it("returns null when in another org", async () => {
    const m = makeClient({ rows: [row({ id: "a", organization_id: ORG_B })] });
    const r = await getDashboard(ORG_A, "a", m.client);
    expect(r).toBeNull();
  });
});

describe("createDashboard", () => {
  it("inserts + audits", async () => {
    const m = makeClient({ rows: [], insert_id: "new" });
    const r = await createDashboard(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          name: "Pulse",
          layout: { widgets: [{ type: "lead_count_by_state" }] },
        },
      },
      m.client,
    );
    expect(r.id).toBe("new");
    expect(m.inserts).toHaveLength(1);
    expect(m.audit[0]).toMatchObject({ action: "dashboard_created" });
  });
});

describe("updateDashboardLayout", () => {
  it("updates + audits", async () => {
    const m = makeClient({ rows: [row({ id: "d1" })] });
    await updateDashboardLayout(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          id: "d1",
          name: "Renamed",
          layout: { widgets: [{ type: "active_users_count" }] },
        },
      },
      m.client,
    );
    expect(m.updates[0].payload.name).toBe("Renamed");
    expect(m.audit[0]).toMatchObject({ action: "dashboard_updated" });
  });

  it("rejects cross-tenant target", async () => {
    const m = makeClient({
      rows: [row({ id: "d1", organization_id: ORG_B })],
    });
    await expect(
      updateDashboardLayout(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { id: "d1", layout: { widgets: [] } },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(DashboardError);
  });
});

describe("deleteDashboard", () => {
  it("soft-deletes + audits", async () => {
    const m = makeClient({ rows: [row({ id: "d1" })] });
    await deleteDashboard(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { id: "d1" },
      },
      m.client,
    );
    expect(m.updates[0].payload.deleted_at).toBeTruthy();
    expect(m.audit[0]).toMatchObject({ action: "dashboard_deleted" });
  });
});
