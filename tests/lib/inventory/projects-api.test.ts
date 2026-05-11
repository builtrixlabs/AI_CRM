import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProject,
  getProjectDetail,
  listProjects,
} from "@/lib/inventory/projects-api";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const ACTOR = "44444444-5555-4555-8666-888888888888";
const PROJECT_ID = "22222222-3333-4444-8555-666666666666";

type NodeRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type Captured = {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
};

function makeListClient(opts: {
  projects: NodeRow[];
  towers?: Array<{ id: string; data: { project_id?: string } }>;
  units?: Array<{ state: string | null; data: { project_id?: string } }>;
  captured?: Captured;
}): SupabaseClient {
  const captured = opts.captured ?? { inserts: [] };

  return {
    from(table: string) {
      if (table === "nodes") {
        const filters: Record<string, unknown> = {};
        const inFilters: Record<string, unknown[]> = {};
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        };
        chain.in = (k: string, v: unknown[]) => {
          inFilters[k] = v;
          return chain;
        };
        chain.is = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (filters.node_type === "project") {
            const p = opts.projects.find(
              (x) =>
                x.id === filters.id && x.organization_id === filters.organization_id,
            );
            return Promise.resolve({ data: p ?? null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.single = () =>
          Promise.resolve({
            data: { id: "new-project-id" },
            error: null,
          });
        chain.insert = (payload: Record<string, unknown>) => {
          captured.inserts.push({ table, payload });
          return chain;
        };
        // Thenable: resolves to the listed rows for project / tower / unit
        // selects depending on node_type filter.
        (chain as unknown as PromiseLike<unknown>).then = (
          resolve: (v: unknown) => unknown,
        ) => {
          let data: unknown[] = [];
          if (filters.node_type === "project") {
            data = opts.projects.filter(
              (p) => p.organization_id === filters.organization_id,
            );
          } else if (filters.node_type === "tower") {
            const ids = (inFilters["data->>project_id"] as string[]) ?? [];
            data = (opts.towers ?? []).filter((t) =>
              t.data?.project_id ? ids.includes(t.data.project_id) : false,
            );
          } else if (filters.node_type === "unit") {
            const ids = (inFilters["data->>project_id"] as string[]) ?? [];
            data = (opts.units ?? []).filter((u) =>
              u.data?.project_id ? ids.includes(u.data.project_id) : false,
            );
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        };
        return chain;
      }
      if (table === "audit_log") {
        return {
          insert: (payload: Record<string, unknown>) => {
            captured.inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
        };
      }
      return {} as never;
    },
  } as unknown as SupabaseClient;
}

function makeDetailClient(opts: {
  project: NodeRow | null;
  towers?: Array<{ id: string }>;
  units?: Array<{ state: string | null }>;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "nodes") {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        };
        chain.is = () => chain;
        chain.maybeSingle = () => {
          if (filters.node_type === "project") {
            const p = opts.project;
            if (
              p &&
              filters.id === p.id &&
              filters.organization_id === p.organization_id
            ) {
              return Promise.resolve({ data: p, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        (chain as unknown as PromiseLike<unknown>).then = (
          resolve: (v: unknown) => unknown,
        ) => {
          let data: unknown[] = [];
          if (filters.node_type === "tower") data = opts.towers ?? [];
          if (filters.node_type === "unit") data = opts.units ?? [];
          return Promise.resolve({ data, error: null }).then(resolve);
        };
        return chain;
      }
      return {} as never;
    },
  } as unknown as SupabaseClient;
}

describe("createProject", () => {
  it("inserts a project node + audit row with parsed data", async () => {
    const captured: Captured = { inserts: [] };
    const c = makeListClient({ projects: [], captured });
    const r = await createProject(
      {
        organization_id: ORG,
        workspace_id: WS,
        actor_id: ACTOR,
        payload: {
          name: "Skyline Phase 2",
          city: "Bengaluru",
          rera_number: "PRM/KA/RERA/abc",
        },
      },
      c,
    );
    expect(r.id).toBeTruthy();
    expect(captured.inserts.length).toBeGreaterThanOrEqual(2); // nodes + audit
    const nodeInsert = captured.inserts.find((i) => i.table === "nodes");
    expect(nodeInsert?.payload.node_type).toBe("project");
    expect((nodeInsert?.payload.data as Record<string, unknown>).name).toBe(
      "Skyline Phase 2",
    );
    expect((nodeInsert?.payload.data as Record<string, unknown>).rera_number).toBe(
      "PRM/KA/RERA/abc",
    );
    expect(nodeInsert?.payload.state).toBeNull();
    expect(nodeInsert?.payload.organization_id).toBe(ORG);
  });

  it("rejects payload missing required fields", async () => {
    const c = makeListClient({ projects: [] });
    await expect(
      createProject(
        {
          organization_id: ORG,
          workspace_id: WS,
          actor_id: ACTOR,
          // missing city + name
          payload: { name: "", city: "Bengaluru" } as never,
        },
        c,
      ),
    ).rejects.toThrow();
  });
});

describe("listProjects", () => {
  it("aggregates tower + unit counts per project, filtered by org", async () => {
    const c = makeListClient({
      projects: [
        {
          id: PROJECT_ID,
          organization_id: ORG,
          workspace_id: WS,
          label: "Skyline Phase 2",
          state: null,
          data: { name: "Skyline Phase 2", city: "Bengaluru" },
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
        },
      ],
      towers: [
        { id: "t1", data: { project_id: PROJECT_ID } },
        { id: "t2", data: { project_id: PROJECT_ID } },
      ],
      units: [
        { state: "available", data: { project_id: PROJECT_ID } },
        { state: "held", data: { project_id: PROJECT_ID } },
        { state: "booked", data: { project_id: PROJECT_ID } },
      ],
    });
    const rows = await listProjects(ORG, {}, c);
    expect(rows).toHaveLength(1);
    const p = rows[0];
    expect(p.name).toBe("Skyline Phase 2");
    expect(p.tower_count).toBe(2);
    expect(p.unit_count).toBe(3);
    expect(p.by_state.available).toBe(1);
    expect(p.by_state.held).toBe(1);
    expect(p.by_state.booked).toBe(1);
    expect(p.by_state.sold).toBe(0);
  });

  it("returns empty list when no projects in org", async () => {
    const c = makeListClient({ projects: [] });
    const rows = await listProjects(ORG, {}, c);
    expect(rows).toEqual([]);
  });
});

describe("getProjectDetail", () => {
  it("returns null when row not found", async () => {
    const c = makeDetailClient({ project: null });
    const r = await getProjectDetail(ORG, PROJECT_ID, c);
    expect(r).toBeNull();
  });

  it("returns null on cross-tenant id mismatch", async () => {
    const c = makeDetailClient({
      project: {
        id: PROJECT_ID,
        organization_id: "different-org-id",
        workspace_id: WS,
        label: "X",
        state: null,
        data: { name: "X", city: "Y" },
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    });
    const r = await getProjectDetail(ORG, PROJECT_ID, c);
    expect(r).toBeNull();
  });

  it("returns project + tower/unit counts on hit", async () => {
    const c = makeDetailClient({
      project: {
        id: PROJECT_ID,
        organization_id: ORG,
        workspace_id: WS,
        label: "Skyline",
        state: null,
        data: {
          name: "Skyline",
          city: "Bengaluru",
          rera_number: "RR-1",
        },
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
      towers: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
      units: [
        { state: "available" },
        { state: "sold" },
        { state: "registered" },
      ],
    });
    const r = await getProjectDetail(ORG, PROJECT_ID, c);
    expect(r).not.toBeNull();
    expect(r?.tower_count).toBe(3);
    expect(r?.unit_count).toBe(3);
    expect(r?.by_state.available).toBe(1);
    expect(r?.by_state.sold).toBe(1);
    expect(r?.by_state.registered).toBe(1);
    expect(r?.rera_number).toBe("RR-1");
  });
});
