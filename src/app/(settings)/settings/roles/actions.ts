"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  clearOverride,
  setOverride,
  type OverrideMode,
} from "@/lib/auth/role-overrides";
import { BASE_ROLE_PERMS, PERMISSIONS, type Permission } from "@/lib/auth/rbac";
import { GRANTABLE_APP_ROLES, type AppRole } from "@/lib/auth/types";

export type RolesActionResult =
  | { ok: true }
  | { ok: false; error: "permission" | "validation" | "internal"; message?: string };

async function gate(): Promise<{ user_id: string; org_id: string } | null> {
  const user = await getCurrentUser();
  if (!user || !user.org_id) return null;
  if (
    !BASE_ROLE_PERMS[user.profile.base_role].has("settings:manage_roles")
  ) {
    return null;
  }
  return { user_id: user.user.id, org_id: user.org_id };
}

function isAppRole(r: string): r is AppRole {
  return (GRANTABLE_APP_ROLES as ReadonlyArray<string>).includes(r);
}
function isPermission(p: string): p is Permission {
  return (PERMISSIONS as ReadonlyArray<string>).includes(p);
}

export async function setOverrideAction(
  role: string,
  permission: string,
  mode: OverrideMode,
  reason: string
): Promise<RolesActionResult> {
  const g = await gate();
  if (!g) return { ok: false, error: "permission" };
  if (!isAppRole(role) || !isPermission(permission)) {
    return { ok: false, error: "validation", message: "invalid role/permission" };
  }
  const r = await setOverride({
    organization_id: g.org_id,
    role,
    permission,
    mode,
    reason,
    actor_id: g.user_id,
  });
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "reason_required" ||
        r.error === "platform_only_permission" ||
        r.error === "invalid_role" ||
        r.error === "invalid_permission" ||
        r.error === "invalid_mode"
          ? "validation"
          : "internal",
      message: r.error,
    };
  }
  revalidatePath("/settings/roles");
  return { ok: true };
}

export async function clearOverrideAction(
  role: string,
  permission: string
): Promise<RolesActionResult> {
  const g = await gate();
  if (!g) return { ok: false, error: "permission" };
  if (!isAppRole(role) || !isPermission(permission)) {
    return { ok: false, error: "validation", message: "invalid role/permission" };
  }
  const r = await clearOverride({
    organization_id: g.org_id,
    role,
    permission,
    actor_id: g.user_id,
  });
  if (!r.ok) return { ok: false, error: "internal", message: r.error };
  revalidatePath("/settings/roles");
  return { ok: true };
}
