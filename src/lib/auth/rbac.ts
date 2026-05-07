import type { AppRole, BaseRole, Permission } from "./types";

/**
 * Permissions that ONLY super_admin may hold. An override that grants any of
 * these to an org-scoped role is filtered at resolve time. (Per-org admin
 * UIs in D-003 reject the write outright.)
 */
export const PLATFORM_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "platform:manage",
  "organizations:create",
  "organizations:delete",
  "organizations:manage_admins",
  "organizations:manage_subscriptions",
  "platform_analytics:view",
  "platform_tickets:view",
  "platform_tickets:respond",
]);

/**
 * D-001 ships a minimal base-role permission map sufficient to drive routing
 * and the redirect tests in spec AC-1..AC-8. The full ~120-permission catalog
 * for nine roles lands in D-003.
 */
const BASE_ROLE_PERMS: Record<BaseRole, ReadonlySet<Permission>> = {
  super_admin: new Set([
    "platform:manage",
    "organizations:create",
    "organizations:delete",
    "organizations:manage_admins",
    "organizations:manage_subscriptions",
    "platform_analytics:view",
    "platform_tickets:view",
    "platform_tickets:respond",
    "audit:view",
  ]),
  org_owner: new Set([
    "organizations:view",
    "organizations:edit",
    "settings:manage_users",
    "settings:manage_roles",
    "settings:manage_integrations",
    "subscriptions:view",
    "subscriptions:manage",
    "billing:view",
    "audit:view",
  ]),
  org_admin: new Set([
    "organizations:view",
    "organizations:edit",
    "settings:manage_users",
    "settings:manage_roles",
    "settings:manage_integrations",
    "subscriptions:view",
    "audit:view",
    "dashboards:customize",
    "tables:customize",
    "agents:provision",
    "directives:author",
  ]),
  workspace_admin: new Set([
    "leads:view",
    "leads:create",
    "leads:edit",
    "leads:assign",
    "deals:view",
    "deals:create",
    "deals:edit",
    "agents:approve_T2",
    "agents:approve_T3",
    "audit:view",
  ]),
  manager: new Set([
    "leads:view",
    "leads:create",
    "leads:edit",
    "leads:assign",
    "deals:view",
    "deals:create",
    "deals:edit",
    "audit:view",
  ]),
  sales_rep: new Set([
    "leads:view",
    "leads:create",
    "leads:edit",
    "deals:view",
    "deals:create",
    "deals:edit",
  ]),
  read_only: new Set(["leads:view", "deals:view"]),
  channel_partner: new Set([
    "leads:view",
    "leads:create",
  ]),
  service_account: new Set(),
};

/**
 * App roles granted via the user_app_roles bridge table layer on top of base.
 * Permissions are workspace-scoped at the data plane (RLS), but at the
 * resolver level we just UNION the sets.
 */
const APP_ROLE_PERMS: Record<AppRole, ReadonlySet<Permission>> = {
  org_owner: BASE_ROLE_PERMS.org_owner,
  org_admin: BASE_ROLE_PERMS.org_admin,
  workspace_admin: BASE_ROLE_PERMS.workspace_admin,
  manager: BASE_ROLE_PERMS.manager,
  sales_rep: BASE_ROLE_PERMS.sales_rep,
  read_only: BASE_ROLE_PERMS.read_only,
  channel_partner: BASE_ROLE_PERMS.channel_partner,
};

export type EffectivePermissionsArgs = {
  base_role: BaseRole;
  bridge_app_roles: AppRole[];
  org_allow_overrides: Permission[];
  org_deny_overrides: Permission[];
};

/**
 * Three-layer resolver: base UNION bridge UNION allow EXCEPT deny.
 *
 * - Allow overrides for PLATFORM_ONLY_PERMISSIONS are silently filtered when
 *   applied to a non-super_admin role (super_admin already has them via base).
 * - Deny wins over allow on the same permission.
 */
export function effectivePermissions(
  args: EffectivePermissionsArgs
): Set<Permission> {
  const out = new Set<Permission>(BASE_ROLE_PERMS[args.base_role]);

  for (const role of args.bridge_app_roles) {
    for (const p of APP_ROLE_PERMS[role]) out.add(p);
  }

  for (const p of args.org_allow_overrides) {
    if (
      PLATFORM_ONLY_PERMISSIONS.has(p) &&
      args.base_role !== "super_admin"
    ) {
      continue;
    }
    out.add(p);
  }

  for (const p of args.org_deny_overrides) {
    out.delete(p);
  }

  return out;
}
