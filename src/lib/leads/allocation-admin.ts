// D-610 (V6 Phase 1) — CRUD for allocation rules, teams, and team
// membership. Every query is org-scoped (the service-role client bypasses
// RLS per baseline/110 §IX, so the organization_id filter is the
// load-bearing tenant guard). The allocation_rules:manage permission is
// gated in the server actions, not here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AllocationConditions,
  AllocationRule,
  AllocationTargetKind,
} from "./allocation-engine";

export type AdminResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      reason:
        | "duplicate_priority"
        | "duplicate"
        | "not_found"
        | "validation"
        | "internal";
      message?: string;
    };

export type TeamWithMembers = {
  id: string;
  name: string;
  members: Array<{ profile_id: string; display_name: string }>;
};

// ── Allocation rules ──────────────────────────────────────────────────────

export async function listAllocationRules(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AllocationRule[]> {
  const { data } = await client
    .from("lead_allocation_rules")
    .select(
      "id, organization_id, name, priority, conditions, target_kind, target_user_id, target_team_id, active",
    )
    .eq("organization_id", organization_id)
    .order("priority", { ascending: true });
  return (data as AllocationRule[] | null) ?? [];
}

export async function createAllocationRule(
  args: {
    organization_id: string;
    name: string;
    priority: number;
    conditions: AllocationConditions;
    target_kind: AllocationTargetKind;
    target_user_id?: string | null;
    target_team_id?: string | null;
    created_by: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AdminResult> {
  const { data, error } = await client
    .from("lead_allocation_rules")
    .insert({
      organization_id: args.organization_id,
      name: args.name,
      priority: args.priority,
      conditions: args.conditions,
      target_kind: args.target_kind,
      target_user_id: args.target_user_id ?? null,
      target_team_id: args.target_team_id ?? null,
      created_by: args.created_by,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        reason: "duplicate_priority",
        message: `Priority ${args.priority} is already used by another rule`,
      };
    }
    return { ok: false, reason: "internal", message: error.message };
  }
  return { ok: true, id: (data as { id: string } | null)?.id };
}

export async function toggleAllocationRule(
  organization_id: string,
  id: string,
  active: boolean,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AdminResult> {
  const { error } = await client
    .from("lead_allocation_rules")
    .update({ active })
    .eq("organization_id", organization_id)
    .eq("id", id);
  if (error) return { ok: false, reason: "internal", message: error.message };
  return { ok: true };
}

export async function deleteAllocationRule(
  organization_id: string,
  id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AdminResult> {
  const { error } = await client
    .from("lead_allocation_rules")
    .delete()
    .eq("organization_id", organization_id)
    .eq("id", id);
  if (error) return { ok: false, reason: "internal", message: error.message };
  return { ok: true };
}

// ── Teams + membership ────────────────────────────────────────────────────

export async function listTeamsWithMembers(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<TeamWithMembers[]> {
  const { data: teams } = await client
    .from("teams")
    .select("id, name")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  const teamRows =
    (teams as Array<{ id: string; name: string }> | null) ?? [];
  if (teamRows.length === 0) return [];

  const { data: members } = await client
    .from("team_members")
    .select("team_id, profile_id")
    .eq("organization_id", organization_id);
  const memberRows =
    (members as Array<{ team_id: string; profile_id: string }> | null) ?? [];

  const profileIds = Array.from(
    new Set(memberRows.map((m) => m.profile_id)),
  );
  const nameMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profs } = await client
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    for (const p of (profs as Array<{
      id: string;
      display_name: string;
    }> | null) ?? []) {
      nameMap.set(p.id, p.display_name);
    }
  }

  return teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    members: memberRows
      .filter((m) => m.team_id === t.id)
      .map((m) => ({
        profile_id: m.profile_id,
        display_name: nameMap.get(m.profile_id) ?? m.profile_id,
      })),
  }));
}

export async function createTeam(
  args: { organization_id: string; name: string; created_by: string },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AdminResult> {
  // teams.workspace_id is NOT NULL — resolve the org's oldest workspace.
  const w = await client
    .from("workspaces")
    .select("id")
    .eq("organization_id", args.organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const workspace_id = (w.data as { id?: string } | null)?.id ?? null;
  if (!workspace_id) {
    return {
      ok: false,
      reason: "validation",
      message: "No workspace available for organization",
    };
  }

  const { data, error } = await client
    .from("teams")
    .insert({
      organization_id: args.organization_id,
      workspace_id,
      name: args.name,
      created_by: args.created_by,
      created_via: "manual",
      updated_by: args.created_by,
      updated_via: "manual",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        reason: "duplicate",
        message: "A team with that name already exists",
      };
    }
    return { ok: false, reason: "internal", message: error.message };
  }
  return { ok: true, id: (data as { id: string } | null)?.id };
}

export async function addTeamMember(
  args: {
    organization_id: string;
    team_id: string;
    profile_id: string;
    created_by: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AdminResult> {
  const { error } = await client.from("team_members").insert({
    organization_id: args.organization_id,
    team_id: args.team_id,
    profile_id: args.profile_id,
    created_by: args.created_by,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        reason: "duplicate",
        message: "Already a member of this team",
      };
    }
    return { ok: false, reason: "internal", message: error.message };
  }
  return { ok: true };
}

export async function removeTeamMember(
  args: { organization_id: string; team_id: string; profile_id: string },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AdminResult> {
  const { error } = await client
    .from("team_members")
    .delete()
    .eq("organization_id", args.organization_id)
    .eq("team_id", args.team_id)
    .eq("profile_id", args.profile_id);
  if (error) return { ok: false, reason: "internal", message: error.message };
  return { ok: true };
}
