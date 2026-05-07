import {
  effectivePermissions,
  type EffectivePermissionsArgs,
  type Permission,
} from "./rbac";
import type { AppRole, CurrentUser } from "./types";

/**
 * Thrown when a user lacks a required permission. Carries enough context to
 * audit (`user_id`, `perm`, `org_id`) without leaking implementation details
 * or stack traces to the client.
 */
export class PermissionDenied extends Error {
  readonly user_id: string;
  readonly perm: Permission;
  readonly org_id: string | null;
  constructor(user_id: string, perm: Permission, org_id: string | null) {
    super(`PermissionDenied: ${user_id} lacks ${perm}`);
    this.name = "PermissionDenied";
    this.user_id = user_id;
    this.perm = perm;
    this.org_id = org_id;
  }
}

/**
 * Resolve effective permissions for a user. Pure — caller passes the override
 * lists from the DB (loaded via `listOverrides`). For request-scoped caching,
 * resolve once per request and pass the resulting Set to the helpers below.
 */
export function resolveForUser(
  user: CurrentUser,
  org_allow: Permission[] = [],
  org_deny: Permission[] = []
): Set<Permission> {
  const args: EffectivePermissionsArgs = {
    base_role: user.profile.base_role,
    bridge_app_roles: user.app_roles.map((r) => r.app_role) as AppRole[],
    org_allow_overrides: org_allow,
    org_deny_overrides: org_deny,
  };
  return effectivePermissions(args);
}

/** Boolean check. Use the cached set when calling repeatedly per request. */
export function hasPermission(
  user: CurrentUser,
  perm: Permission,
  cached?: Set<Permission>
): boolean {
  const set = cached ?? resolveForUser(user);
  return set.has(perm);
}

/**
 * Server-action gate. Throws `PermissionDenied` (with user_id + perm + org_id)
 * if the user lacks the permission. Use immediately after `getCurrentUser()`
 * in every mutating server action.
 */
export function requirePermission(
  user: CurrentUser,
  perm: Permission,
  cached?: Set<Permission>
): void {
  const set = cached ?? resolveForUser(user);
  if (!set.has(perm)) {
    throw new PermissionDenied(user.user.id, perm, user.org_id);
  }
}

/**
 * Returns the first permission from `perms` that the user holds. Throws
 * `PermissionDenied` against the LAST permission in the list if none match
 * (so the audit log captures something specific).
 */
export function requireAnyOf(
  user: CurrentUser,
  perms: Permission[],
  cached?: Set<Permission>
): Permission {
  if (perms.length === 0) {
    throw new Error("requireAnyOf called with empty perms list");
  }
  const set = cached ?? resolveForUser(user);
  for (const p of perms) {
    if (set.has(p)) return p;
  }
  throw new PermissionDenied(user.user.id, perms[perms.length - 1], user.org_id);
}
