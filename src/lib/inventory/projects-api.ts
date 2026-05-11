import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode } from "@/lib/nodes/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  projectCreateSchema,
  emptyByStateCounts,
  type ByStateCounts,
  type ProjectCreateInput,
  type ProjectRow,
} from "./types";
import { INVENTORY_STATES, isValidState } from "./transitions";

/**
 * D-420 — project node CRUD helpers.
 *
 * Projects live in `nodes` with `node_type='project'` (added in D-420
 * migration). Stateless at the row level; the project lifecycle (Pre-launch
 * → Handover) lands with D-421's customer-facing project canvas.
 *
 * Cross-tenant guard: every read filters by `organization_id`; every write
 * stamps it from the caller's session.
 */

export type CreateProjectArgs = {
  organization_id: string;
  workspace_id: string;
  actor_id: string;
  payload: ProjectCreateInput;
};

export async function createProject(
  args: CreateProjectArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const parsed = projectCreateSchema.parse(args.payload);
  return createNode(
    {
      organization_id: args.organization_id,
      workspace_id: args.workspace_id,
      node_type: "project",
      label: parsed.name,
      data: parsed,
      state: null,
      created_by: args.actor_id,
      created_via: "manual",
    },
    client,
  );
}

function projectFromRow(r: {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}): ProjectRow {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null =>
    typeof d[k] === "string" ? (d[k] as string) : null;
  return {
    id: r.id,
    organization_id: r.organization_id,
    workspace_id: r.workspace_id,
    name: typeof d.name === "string" ? d.name : r.label,
    city: typeof d.city === "string" ? d.city : "—",
    address: str("address"),
    rera_number: str("rera_number"),
    possession_date_committed: str("possession_date_committed"),
    possession_date_revised: str("possession_date_revised"),
    oc_status: str("oc_status"),
    cc_status: str("cc_status"),
    brochure_url: str("brochure_url"),
    layout_url: str("layout_url"),
    notes: str("notes"),
    state: r.state,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export type ListProjectsFilters = {
  city?: string | null;
};

export type ListProjectsRow = ProjectRow & {
  tower_count: number;
  unit_count: number;
  by_state: ByStateCounts;
};

export async function listProjects(
  organization_id: string,
  filters: ListProjectsFilters = {},
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ListProjectsRow[]> {
  let q = client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, data, created_at, updated_at",
    )
    .eq("organization_id", organization_id)
    .eq("node_type", "project")
    .is("deleted_at", null);
  if (filters.city) {
    q = q.eq("data->>city", filters.city);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];

  const projects = (data as Array<Parameters<typeof projectFromRow>[0]>).map(
    (r) => ({
      ...projectFromRow(r),
      tower_count: 0,
      unit_count: 0,
      by_state: emptyByStateCounts(),
    }),
  );
  if (projects.length === 0) return projects;
  const ids = projects.map((p) => p.id);

  // One scan over towers under these projects.
  const towersRes = await client
    .from("nodes")
    .select("id, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "tower")
    .is("deleted_at", null)
    .in("data->>project_id", ids);
  if (!towersRes.error && towersRes.data) {
    for (const t of towersRes.data as Array<{
      id: string;
      data: { project_id?: string };
    }>) {
      const owner = projects.find((p) => p.id === t.data?.project_id);
      if (owner) owner.tower_count += 1;
    }
  }

  // One scan over units under these projects (matches both new `project_id`
  // and legacy `property_id` for the same row id).
  const unitsRes = await client
    .from("nodes")
    .select("state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .in("data->>project_id", ids);
  if (!unitsRes.error && unitsRes.data) {
    for (const u of unitsRes.data as Array<{
      state: string | null;
      data: { project_id?: string };
    }>) {
      const owner = projects.find((p) => p.id === u.data?.project_id);
      if (!owner) continue;
      owner.unit_count += 1;
      const s = isValidState(u.state) ? u.state : "available";
      owner.by_state[s as (typeof INVENTORY_STATES)[number]] += 1;
    }
  }

  return projects;
}

export type ProjectDetail = ListProjectsRow;

export async function getProjectDetail(
  organization_id: string,
  project_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ProjectDetail | null> {
  const { data, error } = await client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, data, created_at, updated_at",
    )
    .eq("id", project_id)
    .eq("organization_id", organization_id)
    .eq("node_type", "project")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row: ProjectDetail = {
    ...projectFromRow(data as Parameters<typeof projectFromRow>[0]),
    tower_count: 0,
    unit_count: 0,
    by_state: emptyByStateCounts(),
  };

  const towersRes = await client
    .from("nodes")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("node_type", "tower")
    .is("deleted_at", null)
    .eq("data->>project_id", project_id);
  if (!towersRes.error && towersRes.data) {
    row.tower_count = towersRes.data.length;
  }

  const unitsRes = await client
    .from("nodes")
    .select("state")
    .eq("organization_id", organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .eq("data->>project_id", project_id);
  if (!unitsRes.error && unitsRes.data) {
    for (const u of unitsRes.data as Array<{ state: string | null }>) {
      row.unit_count += 1;
      const s = isValidState(u.state) ? u.state : "available";
      row.by_state[s as (typeof INVENTORY_STATES)[number]] += 1;
    }
  }

  return row;
}
