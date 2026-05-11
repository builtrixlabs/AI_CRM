import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode } from "@/lib/nodes/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  towerCreateSchema,
  emptyByStateCounts,
  type ByStateCounts,
  type TowerCreateInput,
  type TowerRow,
} from "./types";
import { INVENTORY_STATES, isValidState } from "./transitions";

/**
 * D-420 — tower node CRUD helpers.
 *
 * Towers live in `nodes` with `node_type='tower'`. Each tower links to a
 * project via `data.project_id`. Stateless — the tower inherits its parent
 * project's lifecycle.
 */

export type CreateTowerArgs = {
  organization_id: string;
  workspace_id: string;
  actor_id: string;
  payload: TowerCreateInput;
};

export async function createTower(
  args: CreateTowerArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const parsed = towerCreateSchema.parse(args.payload);

  // Cross-tenant guard: assert the parent project belongs to the caller's org.
  const projectRes = await client
    .from("nodes")
    .select("id")
    .eq("id", parsed.project_id)
    .eq("organization_id", args.organization_id)
    .eq("node_type", "project")
    .is("deleted_at", null)
    .maybeSingle();
  if (projectRes.error || !projectRes.data) {
    throw new Error(
      `Project ${parsed.project_id} not found in organization ${args.organization_id}`,
    );
  }

  return createNode(
    {
      organization_id: args.organization_id,
      workspace_id: args.workspace_id,
      node_type: "tower",
      label: parsed.name,
      data: parsed,
      state: null,
      created_by: args.actor_id,
      created_via: "manual",
    },
    client,
  );
}

function towerFromRow(r: {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}): TowerRow {
  const d = (r.data ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    organization_id: r.organization_id,
    workspace_id: r.workspace_id,
    project_id: typeof d.project_id === "string" ? d.project_id : "",
    name: typeof d.name === "string" ? d.name : r.label,
    total_floors:
      typeof d.total_floors === "number" ? d.total_floors : null,
    units_per_floor:
      typeof d.units_per_floor === "number" ? d.units_per_floor : null,
    notes: typeof d.notes === "string" ? d.notes : null,
    state: r.state,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export type ListTowersRow = TowerRow & {
  unit_count: number;
  by_state: ByStateCounts;
};

export async function listTowersForProject(
  organization_id: string,
  project_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ListTowersRow[]> {
  const { data, error } = await client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, data, created_at, updated_at",
    )
    .eq("organization_id", organization_id)
    .eq("node_type", "tower")
    .is("deleted_at", null)
    .eq("data->>project_id", project_id)
    .order("data->>name", { ascending: true })
    .limit(200);
  if (error || !data) return [];

  const towers = (data as Array<Parameters<typeof towerFromRow>[0]>).map(
    (r) => ({
      ...towerFromRow(r),
      unit_count: 0,
      by_state: emptyByStateCounts(),
    }),
  );
  if (towers.length === 0) return towers;
  const ids = towers.map((t) => t.id);

  // One scan over units under these towers.
  const unitsRes = await client
    .from("nodes")
    .select("state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .in("data->>tower_id", ids);
  if (!unitsRes.error && unitsRes.data) {
    for (const u of unitsRes.data as Array<{
      state: string | null;
      data: { tower_id?: string };
    }>) {
      const owner = towers.find((t) => t.id === u.data?.tower_id);
      if (!owner) continue;
      owner.unit_count += 1;
      const s = isValidState(u.state) ? u.state : "available";
      owner.by_state[s as (typeof INVENTORY_STATES)[number]] += 1;
    }
  }

  return towers;
}

export async function getTowerDetail(
  organization_id: string,
  tower_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ListTowersRow | null> {
  const { data, error } = await client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, data, created_at, updated_at",
    )
    .eq("id", tower_id)
    .eq("organization_id", organization_id)
    .eq("node_type", "tower")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;

  const tower: ListTowersRow = {
    ...towerFromRow(data as Parameters<typeof towerFromRow>[0]),
    unit_count: 0,
    by_state: emptyByStateCounts(),
  };

  const unitsRes = await client
    .from("nodes")
    .select("state")
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .eq("data->>tower_id", tower_id);
  if (!unitsRes.error && unitsRes.data) {
    for (const u of unitsRes.data as Array<{ state: string | null }>) {
      tower.unit_count += 1;
      const s = isValidState(u.state) ? u.state : "available";
      tower.by_state[s as (typeof INVENTORY_STATES)[number]] += 1;
    }
  }

  return tower;
}
