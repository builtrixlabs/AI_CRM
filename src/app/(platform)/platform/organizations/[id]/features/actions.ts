"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  deleteOrgFeatureFlag,
  setOrgFeatureFlag,
} from "@/lib/platform/feature-flags";

export type FlagActionResult =
  | { ok: true }
  | { ok: false; reason: "permission" | "validation" | "not_found" | "internal"; message?: string };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const FLAG_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

export async function setFlagAction(
  organization_id: string,
  flag: string,
  value: boolean,
): Promise<FlagActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, reason: "permission" };
  }
  if (!UUID_RE.test(organization_id)) {
    return { ok: false, reason: "validation", message: "bad_org_id" };
  }
  if (!FLAG_NAME_RE.test(flag)) {
    return { ok: false, reason: "validation", message: "bad_flag_name" };
  }
  const r = await setOrgFeatureFlag({
    organization_id,
    flag,
    value,
  });
  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    return { ok: false, reason: "internal", message: r.reason };
  }
  revalidatePath(`/platform/organizations/${organization_id}/features`);
  return { ok: true };
}

export async function deleteFlagAction(
  organization_id: string,
  flag: string,
): Promise<FlagActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, reason: "permission" };
  }
  if (!UUID_RE.test(organization_id)) {
    return { ok: false, reason: "validation", message: "bad_org_id" };
  }
  const r = await deleteOrgFeatureFlag({ organization_id, flag });
  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    return { ok: false, reason: "internal", message: r.reason };
  }
  revalidatePath(`/platform/organizations/${organization_id}/features`);
  return { ok: true };
}
