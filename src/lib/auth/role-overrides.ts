import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  BASE_ROLE_PERMS,
  PERMISSIONS,
  PLATFORM_ONLY_PERMISSIONS,
  type Permission,
} from "./rbac";
import { GRANTABLE_APP_ROLES, type AppRole } from "./types";

export type OverrideMode = "allow" | "deny";

export type OverrideRow = {
  id: string;
  organization_id: string;
  role: AppRole;
  permission: Permission;
  mode: OverrideMode;
  reason: string;
  created_at: string;
};

export type SetOverrideArgs = {
  organization_id: string;
  role: AppRole;
  permission: Permission;
  mode: OverrideMode;
  reason: string;
  actor_id: string;
};

export type ClearOverrideArgs = {
  organization_id: string;
  role: AppRole;
  permission: Permission;
  actor_id: string;
};

export type WriteResult = { ok: true } | { ok: false; error: string };

function isPermission(p: unknown): p is Permission {
  return (
    typeof p === "string" && (PERMISSIONS as ReadonlyArray<string>).includes(p)
  );
}

function isAppRole(r: unknown): r is AppRole {
  return (
    typeof r === "string" &&
    (GRANTABLE_APP_ROLES as ReadonlyArray<string>).includes(r)
  );
}

/**
 * Fetch all active overrides for an org, latest-row-wins per (role,
 * permission) pair (the unique index includes mode so two modes for the
 * same pair coexist — we collapse to the most recent).
 */
export async function listOverrides(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<OverrideRow[]> {
  const { data, error } = await client
    .from("role_permission_overrides")
    .select("id, organization_id, role, permission, mode, reason, created_at")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  // Collapse duplicates per (role, permission) — most recent wins.
  const seen = new Set<string>();
  const out: OverrideRow[] = [];
  for (const r of data as OverrideRow[]) {
    if (!isAppRole(r.role) || !isPermission(r.permission)) continue;
    const k = `${r.role}::${r.permission}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export async function setOverride(
  args: SetOverrideArgs,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  if (!isAppRole(args.role)) return { ok: false, error: "invalid_role" };
  if (!isPermission(args.permission)) {
    return { ok: false, error: "invalid_permission" };
  }
  if (args.mode !== "allow" && args.mode !== "deny") {
    return { ok: false, error: "invalid_mode" };
  }
  if (!args.reason || args.reason.trim().length < 3) {
    return { ok: false, error: "reason_required" };
  }

  // Pre-validate platform-only allow on non-super role — user-friendlier than
  // letting the DB trigger error bubble up.
  if (
    args.mode === "allow" &&
    PLATFORM_ONLY_PERMISSIONS.has(args.permission)
  ) {
    return { ok: false, error: "platform_only_permission" };
  }

  // Soft-delete any prior row for the same (role, permission) so the unique
  // index doesn't collide on a flip from allow→deny.
  await client
    .from("role_permission_overrides")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: args.actor_id,
      deleted_reason: "superseded by new override",
    })
    .eq("organization_id", args.organization_id)
    .eq("role", args.role)
    .eq("permission", args.permission)
    .is("deleted_at", null);

  const { error } = await client.from("role_permission_overrides").insert({
    organization_id: args.organization_id,
    role: args.role,
    permission: args.permission,
    mode: args.mode,
    reason: args.reason.trim(),
    created_by: args.actor_id,
    created_via: "manual",
    updated_by: args.actor_id,
    updated_via: "manual",
  });
  if (error) return { ok: false, error: error.message };

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: args.organization_id,
    workspace_id: null,
    table_name: "role_permission_overrides",
    record_id: null,
    action: "role_permission_override_set",
    diff: {
      role: args.role,
      permission: args.permission,
      mode: args.mode,
      reason: args.reason.trim(),
    },
  });
  return { ok: true };
}

export async function clearOverride(
  args: ClearOverrideArgs,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  if (!isAppRole(args.role)) return { ok: false, error: "invalid_role" };
  if (!isPermission(args.permission)) {
    return { ok: false, error: "invalid_permission" };
  }
  const { error } = await client
    .from("role_permission_overrides")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: args.actor_id,
      deleted_reason: "cleared via /settings/roles",
    })
    .eq("organization_id", args.organization_id)
    .eq("role", args.role)
    .eq("permission", args.permission)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: args.organization_id,
    workspace_id: null,
    table_name: "role_permission_overrides",
    record_id: null,
    action: "role_permission_override_cleared",
    diff: { role: args.role, permission: args.permission },
  });
  return { ok: true };
}

/**
 * Compute the effective state of a (role, permission) pair given:
 *   - default from BASE_ROLE_PERMS
 *   - the org's override map (if any)
 *
 * Returns the final state that the resolver would give an org user.
 */
export function effectiveStateFor(
  role: AppRole,
  permission: Permission,
  override: OverrideMode | null
): {
  granted: boolean;
  default_granted: boolean;
  override: OverrideMode | null;
  platform_only: boolean;
} {
  const default_granted = BASE_ROLE_PERMS[role].has(permission);
  const platform_only = PLATFORM_ONLY_PERMISSIONS.has(permission);
  let granted = default_granted;
  if (!platform_only && override === "allow") granted = true;
  if (override === "deny") granted = false;
  return { granted, default_granted, override, platform_only };
}
