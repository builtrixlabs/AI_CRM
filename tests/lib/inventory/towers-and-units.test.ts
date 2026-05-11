import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTower } from "@/lib/inventory/towers-api";
import { createUnit, getUnitDetail } from "@/lib/inventory/units-api";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const ACTOR = "44444444-5555-4555-8666-888888888888";
const PROJECT_ID = "22222222-3333-4444-8555-666666666666";
const TOWER_ID = "33333333-4444-4555-8666-777777777777";
const UNIT_ID = "55555555-6666-4777-8888-999999999999";

type Captured = {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
};

function clientWithGuards(opts: {
  projectExists: boolean;
  tower?: {
    id: string;
    organization_id: string;
    data: { project_id: string };
  } | null;
  unit?: {
    id: string;
    organization_id: string;
    workspace_id: string;
    label: string;
    state: string | null;
    state_expires_at: string | null;
    data: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  } | null;
  captured?: Captured;
}): SupabaseClient {
  const captured = opts.captured ?? { inserts: [] };
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
            return Promise.resolve({
              data: opts.projectExists
                ? { id: filters.id }
                : null,
              error: null,
            });
          }
          if (filters.node_type === "tower") {
            const t = opts.tower;
            if (!t) return Promise.resolve({ data: null, error: null });
            if (
              t.id === filters.id &&
              t.organization_id === filters.organization_id
            ) {
              return Promise.resolve({ data: t, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }
          if (filters.node_type === "unit") {
            const u = opts.unit;
            if (!u) return Promise.resolve({ data: null, error: null });
            if (
              u.id === filters.id &&
              u.organization_id === filters.organization_id
            ) {
              return Promise.resolve({ data: u, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.single = () =>
          Promise.resolve({ data: { id: "new-id" }, error: null });
        chain.insert = (payload: Record<string, unknown>) => {
          captured.inserts.push({ table, payload });
          return chain;
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

describe("createTower", () => {
  it("inserts a tower with project_id, audit-logs", async () => {
    const captured: Captured = { inserts: [] };
    const c = clientWithGuards({ projectExists: true, captured });
    const r = await createTower(
      {
        organization_id: ORG,
        workspace_id: WS,
        actor_id: ACTOR,
        payload: {
          project_id: PROJECT_ID,
          name: "Tower A",
          total_floors: 30,
          units_per_floor: 4,
        },
      },
      c,
    );
    expect(r.id).toBeTruthy();
    const nodeInsert = captured.inserts.find((i) => i.table === "nodes");
    expect(nodeInsert?.payload.node_type).toBe("tower");
    const d = nodeInsert?.payload.data as Record<string, unknown>;
    expect(d.project_id).toBe(PROJECT_ID);
    expect(d.total_floors).toBe(30);
  });

  it("rejects when parent project not in caller's org", async () => {
    const c = clientWithGuards({ projectExists: false });
    await expect(
      createTower(
        {
          organization_id: ORG,
          workspace_id: WS,
          actor_id: ACTOR,
          payload: { project_id: PROJECT_ID, name: "T" },
        },
        c,
      ),
    ).rejects.toThrow(/Project/);
  });

  it("validates payload (rejects empty name)", async () => {
    const c = clientWithGuards({ projectExists: true });
    await expect(
      createTower(
        {
          organization_id: ORG,
          workspace_id: WS,
          actor_id: ACTOR,
          payload: { project_id: PROJECT_ID, name: "" },
        },
        c,
      ),
    ).rejects.toThrow();
  });
});

describe("createUnit", () => {
  it("inserts a unit with project_id + tower_id, default state='available'", async () => {
    const captured: Captured = { inserts: [] };
    const c = clientWithGuards({
      projectExists: true,
      tower: {
        id: TOWER_ID,
        organization_id: ORG,
        data: { project_id: PROJECT_ID },
      },
      captured,
    });
    const r = await createUnit(
      {
        organization_id: ORG,
        workspace_id: WS,
        actor_id: ACTOR,
        payload: {
          project_id: PROJECT_ID,
          tower_id: TOWER_ID,
          unit_no: "A-1201",
          floor: 12,
          unit_type: "3bhk",
          carpet_area_sqft: 1450,
          base_price: 12_500_000,
        },
      },
      c,
    );
    expect(r.id).toBeTruthy();
    const nodeInsert = captured.inserts.find((i) => i.table === "nodes");
    expect(nodeInsert?.payload.node_type).toBe("unit");
    expect(nodeInsert?.payload.state).toBe("available");
    const d = nodeInsert?.payload.data as Record<string, unknown>;
    expect(d.unit_no).toBe("A-1201");
    expect(d.unit_type).toBe("3bhk");
    expect(d.tower_id).toBe(TOWER_ID);
  });

  it("rejects when project not in org", async () => {
    const c = clientWithGuards({ projectExists: false });
    await expect(
      createUnit(
        {
          organization_id: ORG,
          workspace_id: WS,
          actor_id: ACTOR,
          payload: {
            project_id: PROJECT_ID,
            unit_no: "X",
            unit_type: "2bhk",
          },
        },
        c,
      ),
    ).rejects.toThrow(/Project/);
  });

  it("rejects when tower belongs to a different project", async () => {
    const c = clientWithGuards({
      projectExists: true,
      tower: {
        id: TOWER_ID,
        organization_id: ORG,
        data: { project_id: "different-project-id" },
      },
    });
    await expect(
      createUnit(
        {
          organization_id: ORG,
          workspace_id: WS,
          actor_id: ACTOR,
          payload: {
            project_id: PROJECT_ID,
            tower_id: TOWER_ID,
            unit_no: "X",
            unit_type: "2bhk",
          },
        },
        c,
      ),
    ).rejects.toThrow(/does not belong/);
  });

  it("honours initial_state when set (e.g. seed scripts)", async () => {
    const captured: Captured = { inserts: [] };
    const c = clientWithGuards({ projectExists: true, captured });
    await createUnit(
      {
        organization_id: ORG,
        workspace_id: WS,
        actor_id: ACTOR,
        payload: {
          project_id: PROJECT_ID,
          unit_no: "U2",
          unit_type: "2bhk",
          initial_state: "held",
        },
      },
      c,
    );
    const nodeInsert = captured.inserts.find((i) => i.table === "nodes");
    expect(nodeInsert?.payload.state).toBe("held");
  });
});

describe("getUnitDetail", () => {
  it("returns null when unit not found", async () => {
    const c = clientWithGuards({ projectExists: false, unit: null });
    const r = await getUnitDetail(ORG, UNIT_ID, c);
    expect(r).toBeNull();
  });

  it("returns null on cross-tenant", async () => {
    const c = clientWithGuards({
      projectExists: false,
      unit: {
        id: UNIT_ID,
        organization_id: "other-org",
        workspace_id: WS,
        label: "A-1",
        state: "available",
        state_expires_at: null,
        data: { project_id: PROJECT_ID, unit_no: "A-1" },
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    });
    const r = await getUnitDetail(ORG, UNIT_ID, c);
    expect(r).toBeNull();
  });

  it("returns full unit row on hit", async () => {
    const c = clientWithGuards({
      projectExists: false,
      unit: {
        id: UNIT_ID,
        organization_id: ORG,
        workspace_id: WS,
        label: "A-1201",
        state: "held",
        state_expires_at: "2026-05-12T00:00:00Z",
        data: {
          project_id: PROJECT_ID,
          tower_id: TOWER_ID,
          unit_no: "A-1201",
          unit_type: "3bhk",
          carpet_area_sqft: 1450,
          base_price: 12500000,
        },
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    });
    const r = await getUnitDetail(ORG, UNIT_ID, c);
    expect(r).not.toBeNull();
    expect(r?.unit_no).toBe("A-1201");
    expect(r?.unit_type).toBe("3bhk");
    expect(r?.state).toBe("held");
    expect(r?.state_expires_at).toBe("2026-05-12T00:00:00Z");
    expect(r?.tower_id).toBe(TOWER_ID);
    expect(r?.project_id).toBe(PROJECT_ID);
  });
});
