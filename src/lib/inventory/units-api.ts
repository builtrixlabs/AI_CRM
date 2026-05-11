import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode } from "@/lib/nodes/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  unitCreateSchema,
  type UnitCreateInput,
  type UnitRow,
  type UnitType,
} from "./types";
import { INVENTORY_STATES, isValidState, type UnitState } from "./transitions";

/**
 * D-420 — unit node CRUD helpers.
 *
 * Units live in `nodes` with `node_type='unit'`. Each unit links to a project
 * via `data.project_id` (and optionally a tower via `data.tower_id`).
 *
 * State transitions go through `state-api.ts` (calls the RPC); this module
 * handles inserts, reads, and metadata patches only.
 */

export type CreateUnitArgs = {
  organization_id: string;
  workspace_id: string;
  actor_id: string;
  payload: UnitCreateInput;
};

export async function createUnit(
  args: CreateUnitArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const parsed = unitCreateSchema.parse(args.payload);

  // Cross-tenant guard: assert the parent project (and tower if set) belong
  // to the caller's org.
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
  if (parsed.tower_id) {
    const towerRes = await client
      .from("nodes")
      .select("id, data")
      .eq("id", parsed.tower_id)
      .eq("organization_id", args.organization_id)
      .eq("node_type", "tower")
      .is("deleted_at", null)
      .maybeSingle();
    if (towerRes.error || !towerRes.data) {
      throw new Error(
        `Tower ${parsed.tower_id} not found in organization ${args.organization_id}`,
      );
    }
    const t = towerRes.data as { data: { project_id?: string } | null };
    if (t.data?.project_id !== parsed.project_id) {
      throw new Error(
        `Tower ${parsed.tower_id} does not belong to project ${parsed.project_id}`,
      );
    }
  }

  const { initial_state, ...rest } = parsed;
  const state: UnitState = initial_state ?? "available";

  return createNode(
    {
      organization_id: args.organization_id,
      workspace_id: args.workspace_id,
      node_type: "unit",
      label: parsed.unit_no,
      data: rest,
      state,
      created_by: args.actor_id,
      created_via: "manual",
    },
    client,
  );
}

function unitFromRow(r: {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  state: string | null;
  state_expires_at: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}): UnitRow {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null =>
    typeof d[k] === "string" ? (d[k] as string) : null;
  const num = (k: string): number | null =>
    typeof d[k] === "number" ? (d[k] as number) : null;
  const state = isValidState(r.state) ? r.state : "available";
  return {
    id: r.id,
    organization_id: r.organization_id,
    workspace_id: r.workspace_id,
    project_id:
      (typeof d.project_id === "string" && d.project_id) ||
      (typeof d.property_id === "string" && d.property_id) ||
      "",
    tower_id: typeof d.tower_id === "string" ? d.tower_id : null,
    unit_no: typeof d.unit_no === "string" ? d.unit_no : r.label,
    floor: num("floor"),
    unit_type:
      (str("unit_type") as UnitType | null) ??
      (typeof d.bhk === "number" ? unitTypeFromBhk(d.bhk as number) : "other"),
    carpet_area_sqft: num("carpet_area_sqft"),
    builtup_area_sqft: num("builtup_area_sqft"),
    saleable_area_sqft: num("saleable_area_sqft"),
    facing: str("facing"),
    view: str("view"),
    corner_or_mid: str("corner_or_mid"),
    floor_rise_factor: num("floor_rise_factor"),
    base_price:
      num("base_price") ??
      (typeof d.price === "number" ? (d.price as number) : null),
    price_per_sqft: num("price_per_sqft"),
    plc: num("plc"),
    parking_count: num("parking_count"),
    rera_unit_id: str("rera_unit_id"),
    state,
    state_expires_at: r.state_expires_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function unitTypeFromBhk(bhk: number): UnitType {
  if (bhk <= 0) return "other";
  if (bhk === 1) return "1bhk";
  if (bhk === 2) return "2bhk";
  if (bhk === 3) return "3bhk";
  if (bhk === 4) return "4bhk";
  if (bhk === 5) return "5bhk";
  return "other";
}

export type ListUnitsFilters = {
  state?: (typeof INVENTORY_STATES)[number] | null;
};

export async function listUnitsForProject(
  organization_id: string,
  project_id: string,
  filters: ListUnitsFilters = {},
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<UnitRow[]> {
  let q = client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, state_expires_at, data, created_at, updated_at",
    )
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .eq("data->>project_id", project_id)
    .order("data->>unit_no", { ascending: true })
    .limit(1000);
  if (filters.state) q = q.eq("state", filters.state);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Array<Parameters<typeof unitFromRow>[0]>).map(unitFromRow);
}

export async function listUnitsForTower(
  organization_id: string,
  tower_id: string,
  filters: ListUnitsFilters = {},
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<UnitRow[]> {
  let q = client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, state_expires_at, data, created_at, updated_at",
    )
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .eq("data->>tower_id", tower_id)
    .order("data->>unit_no", { ascending: true })
    .limit(1000);
  if (filters.state) q = q.eq("state", filters.state);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Array<Parameters<typeof unitFromRow>[0]>).map(unitFromRow);
}

export async function getUnitDetail(
  organization_id: string,
  unit_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<UnitRow | null> {
  const { data, error } = await client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, state_expires_at, data, created_at, updated_at",
    )
    .eq("id", unit_id)
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return unitFromRow(data as Parameters<typeof unitFromRow>[0]);
}
