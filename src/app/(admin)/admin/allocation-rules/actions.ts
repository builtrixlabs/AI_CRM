"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  createAllocationRule,
  toggleAllocationRule,
  deleteAllocationRule,
  createTeam,
  addTeamMember,
  removeTeamMember,
} from "@/lib/leads/allocation-admin";
import type {
  AllocationConditions,
  AllocationTargetKind,
} from "@/lib/leads/allocation-engine";

export type AllocationActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "permission" | "validation" | "duplicate" | "internal";
      message?: string;
    };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Gated = { user_id: string; org_id: string } | null;

async function gate(): Promise<Gated> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return null;
  if (!resolveForUser(user).has("allocation_rules:manage")) return null;
  return { user_id: user.user.id, org_id: user.org_id };
}

export type CreateRuleInput = {
  name: string;
  priority: number;
  conditions: AllocationConditions;
  target_kind: AllocationTargetKind;
  target_user_id?: string | null;
  target_team_id?: string | null;
};

export async function createRuleAction(
  input: CreateRuleInput,
): Promise<AllocationActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!input.name.trim()) {
    return { ok: false, reason: "validation", message: "Rule name is required" };
  }
  if (!Number.isInteger(input.priority)) {
    return {
      ok: false,
      reason: "validation",
      message: "Priority must be a whole number",
    };
  }
  if (
    input.target_kind === "user" &&
    (!input.target_user_id || !UUID_RE.test(input.target_user_id))
  ) {
    return { ok: false, reason: "validation", message: "Pick a target user" };
  }
  if (
    input.target_kind !== "user" &&
    (!input.target_team_id || !UUID_RE.test(input.target_team_id))
  ) {
    return { ok: false, reason: "validation", message: "Pick a target team" };
  }

  const r = await createAllocationRule({
    organization_id: g.org_id,
    name: input.name.trim(),
    priority: input.priority,
    conditions: input.conditions,
    target_kind: input.target_kind,
    target_user_id: input.target_kind === "user" ? input.target_user_id : null,
    target_team_id: input.target_kind !== "user" ? input.target_team_id : null,
    created_by: g.user_id,
  });
  if (!r.ok) {
    return {
      ok: false,
      reason: r.reason === "duplicate_priority" ? "duplicate" : "internal",
      message: r.message,
    };
  }
  revalidatePath("/admin/allocation-rules");
  return { ok: true };
}

export async function toggleRuleAction(
  id: string,
  active: boolean,
): Promise<AllocationActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!UUID_RE.test(id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await toggleAllocationRule(g.org_id, id, active);
  if (!r.ok) return { ok: false, reason: "internal", message: r.message };
  revalidatePath("/admin/allocation-rules");
  return { ok: true };
}

export async function deleteRuleAction(
  id: string,
): Promise<AllocationActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!UUID_RE.test(id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await deleteAllocationRule(g.org_id, id);
  if (!r.ok) return { ok: false, reason: "internal", message: r.message };
  revalidatePath("/admin/allocation-rules");
  return { ok: true };
}

export async function createTeamAction(
  name: string,
): Promise<AllocationActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!name.trim()) {
    return { ok: false, reason: "validation", message: "Team name is required" };
  }
  const r = await createTeam({
    organization_id: g.org_id,
    name: name.trim(),
    created_by: g.user_id,
  });
  if (!r.ok) {
    const reason =
      r.reason === "duplicate"
        ? "duplicate"
        : r.reason === "validation"
          ? "validation"
          : "internal";
    return { ok: false, reason, message: r.message };
  }
  revalidatePath("/admin/allocation-rules");
  return { ok: true };
}

export async function addTeamMemberAction(
  teamId: string,
  profileId: string,
): Promise<AllocationActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!UUID_RE.test(teamId) || !UUID_RE.test(profileId)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await addTeamMember({
    organization_id: g.org_id,
    team_id: teamId,
    profile_id: profileId,
    created_by: g.user_id,
  });
  if (!r.ok) {
    return {
      ok: false,
      reason: r.reason === "duplicate" ? "duplicate" : "internal",
      message: r.message,
    };
  }
  revalidatePath("/admin/allocation-rules");
  return { ok: true };
}

export async function removeTeamMemberAction(
  teamId: string,
  profileId: string,
): Promise<AllocationActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!UUID_RE.test(teamId) || !UUID_RE.test(profileId)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await removeTeamMember({
    organization_id: g.org_id,
    team_id: teamId,
    profile_id: profileId,
  });
  if (!r.ok) return { ok: false, reason: "internal", message: r.message };
  revalidatePath("/admin/allocation-rules");
  return { ok: true };
}
