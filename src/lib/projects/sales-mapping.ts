// D-608 (V6 Phase 1) — Project <-> Sales-Person mapping.
//
// CRUD over project_sales_assignments plus resolveSalesRepForProject() —
// the lookup D-601 (Phase 2) calls to auto-assign a site visit's rep.
// Every query is org-scoped; the service-role client bypasses RLS, so the
// organization_id filter is the load-bearing tenant guard (Constitution II).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ProjectSummary = {
  id: string;
  name: string;
  city: string | null;
};
export type OrgRep = {
  id: string;
  display_name: string;
  base_role: string;
  on_leave: boolean;
};
export type ProjectAssignment = {
  id: string;
  sales_rep_id: string;
  sales_rep_name: string;
  sales_rep_on_leave: boolean;
  is_primary: boolean;
  created_at: string;
};
export type ResolvedRep = {
  sales_rep_id: string;
  is_primary: boolean;
  fallback: boolean;
};
export type MappingResult =
  | { ok: true }
  | {
      ok: false;
      reason: "duplicate" | "not_found" | "error";
      message?: string;
    };

export async function listProjects(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ProjectSummary[]> {
  const { data } = await client
    .from("nodes")
    .select("id, label, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "project")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (
    (data as Array<{
      id: string;
      label: string;
      data: Record<string, unknown> | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    name: (typeof r.data?.name === "string" && r.data.name) || r.label,
    city: typeof r.data?.city === "string" ? r.data.city : null,
  }));
}

export async function listOrgReps(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<OrgRep[]> {
  const { data } = await client
    .from("profiles")
    .select("id, display_name, base_role, on_leave")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("display_name", { ascending: true });
  return (
    (data as Array<{
      id: string;
      display_name: string;
      base_role: string;
      on_leave: boolean | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    display_name: r.display_name,
    base_role: r.base_role,
    on_leave: r.on_leave === true,
  }));
}

export async function listProjectAssignments(
  organization_id: string,
  project_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ProjectAssignment[]> {
  const { data } = await client
    .from("project_sales_assignments")
    .select("id, sales_rep_id, is_primary, created_at")
    .eq("organization_id", organization_id)
    .eq("project_id", project_id);
  const rows =
    (data as Array<{
      id: string;
      sales_rep_id: string;
      is_primary: boolean;
      created_at: string;
    }> | null) ?? [];
  if (rows.length === 0) return [];

  const repIds = Array.from(new Set(rows.map((r) => r.sales_rep_id)));
  const profsRes = await client
    .from("profiles")
    .select("id, display_name, on_leave")
    .in("id", repIds);
  const profs = new Map(
    (
      (profsRes.data as Array<{
        id: string;
        display_name: string;
        on_leave: boolean | null;
      }> | null) ?? []
    ).map((p) => [p.id, p]),
  );

  return rows
    .map((r) => {
      const p = profs.get(r.sales_rep_id);
      return {
        id: r.id,
        sales_rep_id: r.sales_rep_id,
        sales_rep_name: p?.display_name ?? r.sales_rep_id,
        sales_rep_on_leave: p?.on_leave === true,
        is_primary: r.is_primary,
        created_at: r.created_at,
      };
    })
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
}

export async function addAssignment(
  args: {
    organization_id: string;
    project_id: string;
    sales_rep_id: string;
    created_by: string;
    is_primary?: boolean;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<MappingResult> {
  const { error } = await client.from("project_sales_assignments").insert({
    organization_id: args.organization_id,
    project_id: args.project_id,
    sales_rep_id: args.sales_rep_id,
    is_primary: args.is_primary ?? false,
    created_by: args.created_by,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: "duplicate" };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true };
}

export async function removeAssignment(
  args: {
    organization_id: string;
    project_id: string;
    sales_rep_id: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<MappingResult> {
  const { error } = await client
    .from("project_sales_assignments")
    .delete()
    .eq("organization_id", args.organization_id)
    .eq("project_id", args.project_id)
    .eq("sales_rep_id", args.sales_rep_id);
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true };
}

/**
 * Make `sales_rep_id` the project's primary rep. Clears every assignment's
 * is_primary for the project first (the partial unique index forbids two
 * `true` rows), then sets the target's. The brief zero-primary window the
 * index permits — resolveSalesRepForProject handles "no primary" anyway.
 */
export async function setPrimaryRep(
  args: {
    organization_id: string;
    project_id: string;
    sales_rep_id: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<MappingResult> {
  const clear = await client
    .from("project_sales_assignments")
    .update({ is_primary: false })
    .eq("organization_id", args.organization_id)
    .eq("project_id", args.project_id);
  const clearErr = (clear as { error: { message: string } | null }).error;
  if (clearErr) {
    return { ok: false, reason: "error", message: clearErr.message };
  }

  const set = await client
    .from("project_sales_assignments")
    .update({ is_primary: true })
    .eq("organization_id", args.organization_id)
    .eq("project_id", args.project_id)
    .eq("sales_rep_id", args.sales_rep_id)
    .select("id");
  const setErr = (set as { error: { message: string } | null }).error;
  if (setErr) return { ok: false, reason: "error", message: setErr.message };
  const rows = (set as { data: unknown[] | null }).data ?? [];
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

/**
 * D-601 lookup — which sales rep should a site visit at this project go to?
 *   - the primary rep, if not on leave;
 *   - else the oldest-assigned available (not on-leave) non-primary rep;
 *   - else null (D-601 then leaves assigned_sales_rep_id null and notifies
 *     the coordinator to assign manually).
 */
export async function resolveSalesRepForProject(
  organization_id: string,
  project_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ResolvedRep | null> {
  const { data } = await client
    .from("project_sales_assignments")
    .select("sales_rep_id, is_primary, created_at")
    .eq("organization_id", organization_id)
    .eq("project_id", project_id);
  const assigns =
    (data as Array<{
      sales_rep_id: string;
      is_primary: boolean;
      created_at: string;
    }> | null) ?? [];
  if (assigns.length === 0) return null;

  const repIds = Array.from(new Set(assigns.map((a) => a.sales_rep_id)));
  const profsRes = await client
    .from("profiles")
    .select("id, on_leave")
    .in("id", repIds);
  const onLeave = new Map(
    (
      (profsRes.data as Array<{ id: string; on_leave: boolean | null }> | null) ??
      []
    ).map((p) => [p.id, p.on_leave === true]),
  );
  const available = (a: { sales_rep_id: string }) =>
    onLeave.get(a.sales_rep_id) !== true;

  const primary = assigns.find((a) => a.is_primary);
  if (primary && available(primary)) {
    return {
      sales_rep_id: primary.sales_rep_id,
      is_primary: true,
      fallback: false,
    };
  }

  const fallback = assigns
    .filter((a) => !a.is_primary && available(a))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
  if (fallback) {
    return {
      sales_rep_id: fallback.sales_rep_id,
      is_primary: false,
      fallback: true,
    };
  }

  return null;
}
