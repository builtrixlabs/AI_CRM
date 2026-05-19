"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  createDefect,
  updateDefect,
  type DefectSeverity,
  type DefectStatus,
} from "@/lib/platform/defects";

export type DefectActionResult =
  | { ok: true; id?: string }
  | { ok: false; reason: "permission" | "validation" | "not_found" | "internal"; message?: string };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function createDefectAction(input: {
  organization_id?: string;
  severity: DefectSeverity;
  title: string;
  description: string;
}): Promise<DefectActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, reason: "permission" };
  }
  if (input.organization_id && !UUID_RE.test(input.organization_id)) {
    return { ok: false, reason: "validation", message: "bad_org_id" };
  }
  const r = await createDefect({
    organization_id: input.organization_id ?? null,
    severity: input.severity,
    title: input.title,
    description: input.description,
    created_by: user.user.id,
  });
  if (!r.ok) {
    if (r.reason === "validation") {
      return { ok: false, reason: "validation", message: r.reason };
    }
    return { ok: false, reason: "internal", message: r.reason };
  }
  revalidatePath("/platform/defects");
  return { ok: true, id: r.id };
}

export async function updateDefectAction(input: {
  id: string;
  status?: DefectStatus;
  severity?: DefectSeverity;
  title?: string;
  description?: string;
  assigned_to?: string | null;
}): Promise<DefectActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, reason: "permission" };
  }
  if (!UUID_RE.test(input.id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  if (input.assigned_to && !UUID_RE.test(input.assigned_to)) {
    return { ok: false, reason: "validation", message: "bad_assignee" };
  }
  const r = await updateDefect(input);
  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    if (r.reason === "validation") {
      return { ok: false, reason: "validation", message: r.reason };
    }
    return { ok: false, reason: "internal", message: r.reason };
  }
  revalidatePath("/platform/defects");
  revalidatePath(`/platform/defects/${input.id}`);
  return { ok: true };
}
