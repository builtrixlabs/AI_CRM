"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  addAssignment,
  removeAssignment,
  setPrimaryRep,
} from "@/lib/projects/sales-mapping";

export type SalesTeamActionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "permission"
        | "duplicate"
        | "not_found"
        | "validation"
        | "internal";
      message?: string;
    };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Gated = { user_id: string; org_id: string } | null;

async function gate(): Promise<Gated> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return null;
  if (!resolveForUser(user).has("projects:assign_sales")) return null;
  return { user_id: user.user.id, org_id: user.org_id };
}

export async function addAssignmentAction(
  projectId: string,
  salesRepId: string,
): Promise<SalesTeamActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!UUID_RE.test(projectId) || !UUID_RE.test(salesRepId)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await addAssignment({
    organization_id: g.org_id,
    project_id: projectId,
    sales_rep_id: salesRepId,
    created_by: g.user_id,
  });
  if (!r.ok) {
    if (r.reason === "duplicate") {
      return {
        ok: false,
        reason: "duplicate",
        message: "Rep already assigned to this project",
      };
    }
    return { ok: false, reason: "internal", message: r.message };
  }
  revalidatePath(`/admin/projects/${projectId}/sales-team`);
  return { ok: true };
}

export async function removeAssignmentAction(
  projectId: string,
  salesRepId: string,
): Promise<SalesTeamActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!UUID_RE.test(projectId) || !UUID_RE.test(salesRepId)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await removeAssignment({
    organization_id: g.org_id,
    project_id: projectId,
    sales_rep_id: salesRepId,
  });
  if (!r.ok) return { ok: false, reason: "internal", message: r.message };
  revalidatePath(`/admin/projects/${projectId}/sales-team`);
  return { ok: true };
}

export async function setPrimaryAction(
  projectId: string,
  salesRepId: string,
): Promise<SalesTeamActionResult> {
  const g = await gate();
  if (!g) return { ok: false, reason: "permission" };
  if (!UUID_RE.test(projectId) || !UUID_RE.test(salesRepId)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await setPrimaryRep({
    organization_id: g.org_id,
    project_id: projectId,
    sales_rep_id: salesRepId,
  });
  if (!r.ok) {
    if (r.reason === "not_found") {
      return {
        ok: false,
        reason: "not_found",
        message: "Rep is not assigned to this project",
      };
    }
    return { ok: false, reason: "internal", message: r.message };
  }
  revalidatePath(`/admin/projects/${projectId}/sales-team`);
  return { ok: true };
}
