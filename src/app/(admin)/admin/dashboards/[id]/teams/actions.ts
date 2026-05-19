"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  publishDashboardToTeam,
  revokeDashboardFromTeam,
} from "@/lib/dashboards/team-scoping";

export type TeamPublishActionResult =
  | { ok: true; idempotent?: boolean }
  | {
      ok: false;
      reason: "permission" | "validation" | "not_found" | "cross_tenant" | "internal";
      message?: string;
    };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function publishToTeamAction(
  dashboard_id: string,
  team_id: string,
  is_default: boolean,
): Promise<TeamPublishActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, reason: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("dashboards:publish_to_team")) {
    return { ok: false, reason: "permission" };
  }
  if (!UUID_RE.test(dashboard_id) || !UUID_RE.test(team_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }

  const r = await publishDashboardToTeam({
    caller_org_id: user.org_id,
    dashboard_id,
    team_id,
    actor_id: user.user.id,
    actor_role: user.profile.base_role,
    is_default,
  });

  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    if (r.reason === "cross_tenant") {
      return { ok: false, reason: "cross_tenant" };
    }
    return { ok: false, reason: "internal", message: r.reason };
  }

  revalidatePath(`/admin/dashboards/${dashboard_id}/teams`);
  revalidatePath("/admin/dashboards");
  return { ok: true, idempotent: r.idempotent };
}

export async function revokeFromTeamAction(
  dashboard_id: string,
  assignment_id: string,
): Promise<TeamPublishActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, reason: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("dashboards:publish_to_team")) {
    return { ok: false, reason: "permission" };
  }
  if (!UUID_RE.test(assignment_id) || !UUID_RE.test(dashboard_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }

  const r = await revokeDashboardFromTeam({
    caller_org_id: user.org_id,
    assignment_id,
    actor_id: user.user.id,
    actor_role: user.profile.base_role,
  });

  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    return { ok: false, reason: "internal", message: r.reason };
  }

  revalidatePath(`/admin/dashboards/${dashboard_id}/teams`);
  revalidatePath("/admin/dashboards");
  return { ok: true };
}
