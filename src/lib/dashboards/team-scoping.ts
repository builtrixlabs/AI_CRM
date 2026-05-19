/**
 * D-612 — team-scoped dashboards. Publish, revoke, list, viewer lookup.
 *
 * Every lib query runs on `getSupabaseAdmin()` and filters by
 * `organization_id` (Constitution II). The `dashboards:publish_to_team`
 * permission is gated at the server-action layer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type TeamDashboardAssignmentRow = {
  id: string;
  organization_id: string;
  dashboard_id: string;
  team_id: string;
  is_default: boolean;
  published_at: string;
  published_by: string;
};

export type TeamDashboardWithTeam = TeamDashboardAssignmentRow & {
  team_name: string | null;
};

export type ViewerDashboard = {
  dashboard_id: string;
  dashboard_name: string;
  team_id: string;
  team_name: string | null;
  is_default: boolean;
  published_at: string;
};

/**
 * Publish a dashboard to a team. Cross-tenant safety: caller must
 * supply caller_org_id; both the dashboard and the team are validated
 * to belong to that org before the insert. Idempotent on the unique
 * (dashboard_id, team_id) index — the second publish returns
 * { ok: true, idempotent: true } without a duplicate audit row.
 */
export async function publishDashboardToTeam(args: {
  caller_org_id: string;
  dashboard_id: string;
  team_id: string;
  actor_id: string;
  actor_role: string;
  is_default?: boolean;
  client?: SupabaseClient;
}): Promise<
  | { ok: true; id: string; idempotent: boolean }
  | { ok: false; reason: "not_found" | "cross_tenant" | string }
> {
  const client = args.client ?? getSupabaseAdmin();

  // Both dashboard and team must belong to caller_org_id.
  const [d, t] = await Promise.all([
    client
      .from("dashboard_definitions")
      .select("organization_id")
      .eq("id", args.dashboard_id)
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("teams")
      .select("organization_id")
      .eq("id", args.team_id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  const dOrg = (d.data as { organization_id: string } | null)?.organization_id;
  const tOrg = (t.data as { organization_id: string } | null)?.organization_id;
  if (!dOrg || !tOrg) return { ok: false, reason: "not_found" };
  if (dOrg !== args.caller_org_id || tOrg !== args.caller_org_id) {
    return { ok: false, reason: "cross_tenant" };
  }

  const { data, error } = await client
    .from("team_dashboard_assignments")
    .insert({
      organization_id: args.caller_org_id,
      dashboard_id: args.dashboard_id,
      team_id: args.team_id,
      is_default: args.is_default ?? false,
      published_by: args.actor_id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" || /duplicate/i.test(error.message ?? "")) {
      // Already published — fetch the existing row id for the caller.
      const { data: existing } = await client
        .from("team_dashboard_assignments")
        .select("id")
        .eq("dashboard_id", args.dashboard_id)
        .eq("team_id", args.team_id)
        .maybeSingle();
      const id = (existing as { id: string } | null)?.id ?? "";
      return { ok: true, id, idempotent: true };
    }
    return { ok: false, reason: error.message };
  }

  const id = (data as { id: string }).id;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "team_dashboard_assignments",
    record_id: id,
    action: "dashboard_published_to_team",
    diff: {
      dashboard_id: args.dashboard_id,
      team_id: args.team_id,
      is_default: args.is_default ?? false,
    },
  });

  return { ok: true, id, idempotent: false };
}

export async function revokeDashboardFromTeam(args: {
  caller_org_id: string;
  assignment_id: string;
  actor_id: string;
  actor_role: string;
  client?: SupabaseClient;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" | string }
> {
  const client = args.client ?? getSupabaseAdmin();

  const { data, error } = await client
    .from("team_dashboard_assignments")
    .delete()
    .eq("id", args.assignment_id)
    .eq("organization_id", args.caller_org_id)
    .select("id, dashboard_id, team_id");

  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) return { ok: false, reason: "not_found" };

  const row = (data as Array<{ id: string; dashboard_id: string; team_id: string }>)[0];

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "team_dashboard_assignments",
    record_id: row.id,
    action: "dashboard_revoked_from_team",
    diff: {
      dashboard_id: row.dashboard_id,
      team_id: row.team_id,
    },
  });

  return { ok: true };
}

/** All team assignments for a dashboard, joined with team name. */
export async function listAssignmentsForDashboard(args: {
  organization_id: string;
  dashboard_id: string;
  client?: SupabaseClient;
}): Promise<TeamDashboardWithTeam[]> {
  const client = args.client ?? getSupabaseAdmin();
  const { data } = await client
    .from("team_dashboard_assignments")
    .select("*")
    .eq("organization_id", args.organization_id)
    .eq("dashboard_id", args.dashboard_id)
    .order("published_at", { ascending: false });
  const rows = (data ?? []) as TeamDashboardAssignmentRow[];
  if (rows.length === 0) return [];

  const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
  const teamMap = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .eq("organization_id", args.organization_id)
      .in("id", teamIds);
    for (const t of (teams ?? []) as Array<{ id: string; name: string }>) {
      teamMap.set(t.id, t.name);
    }
  }
  return rows.map((r) => ({
    ...r,
    team_name: teamMap.get(r.team_id) ?? null,
  }));
}

/**
 * For a viewer, return the dashboards published to any of their teams.
 * Joins:  team_members(profile) → team_dashboard_assignments(team)
 *      → dashboard_definitions(id, name).
 * All three queries are org-filtered; no PostgREST embedded join.
 */
export async function getTeamDashboardsForViewer(args: {
  organization_id: string;
  user_id: string;
  client?: SupabaseClient;
}): Promise<ViewerDashboard[]> {
  const client = args.client ?? getSupabaseAdmin();

  // 1. The viewer's teams.
  const { data: memberships } = await client
    .from("team_members")
    .select("team_id")
    .eq("organization_id", args.organization_id)
    .eq("profile_id", args.user_id);
  const teamIds = ((memberships ?? []) as Array<{ team_id: string }>).map(
    (m) => m.team_id,
  );
  if (teamIds.length === 0) return [];

  // 2. Assignments to any of those teams.
  const { data: assignments } = await client
    .from("team_dashboard_assignments")
    .select("dashboard_id, team_id, is_default, published_at")
    .eq("organization_id", args.organization_id)
    .in("team_id", teamIds)
    .order("published_at", { ascending: false });
  const rows = (assignments ?? []) as Array<{
    dashboard_id: string;
    team_id: string;
    is_default: boolean;
    published_at: string;
  }>;
  if (rows.length === 0) return [];

  // 3. Dashboard names + team names.
  const dashboardIds = Array.from(new Set(rows.map((r) => r.dashboard_id)));
  const [{ data: dashboards }, { data: teams }] = await Promise.all([
    client
      .from("dashboard_definitions")
      .select("id, name")
      .eq("organization_id", args.organization_id)
      .in("id", dashboardIds)
      .is("deleted_at", null),
    client
      .from("teams")
      .select("id, name")
      .eq("organization_id", args.organization_id)
      .in("id", teamIds),
  ]);
  const dMap = new Map(
    ((dashboards ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]),
  );
  const tMap = new Map(
    ((teams ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]),
  );

  return rows
    .filter((r) => dMap.has(r.dashboard_id))
    .map((r) => ({
      dashboard_id: r.dashboard_id,
      dashboard_name: dMap.get(r.dashboard_id) ?? "",
      team_id: r.team_id,
      team_name: tMap.get(r.team_id) ?? null,
      is_default: r.is_default,
      published_at: r.published_at,
    }));
}
