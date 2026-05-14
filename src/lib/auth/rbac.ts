import type { AppRole, BaseRole } from "./types";

/**
 * Authoritative permission catalog for Builtrix CRM (Constitution VIII).
 *
 * Adding a permission = TS literal change here, no migration.
 * Adding a role = enum migration on `base_role` AND a literal in types.ts.
 *
 * D-003 lands a stable core (~70 permissions). D-004 super_admin surfaces and
 * D-005 org_admin cockpit each add their own perms when shipping. Total at
 * V1 GA is expected to be ~120 (PRD §9.3).
 */
export const PERMISSIONS = [
  // ── Platform tier (super_admin only) ─────────────────────────────────────
  "platform:manage",
  "organizations:view",
  "organizations:create",
  "organizations:edit",
  "organizations:delete",
  "organizations:manage_admins",
  "organizations:manage_subscriptions",
  "platform_analytics:view",
  "platform_tickets:view",
  "platform_tickets:respond",

  // ── Org account plane (org_owner / org_admin) ────────────────────────────
  "settings:manage_users",
  "settings:manage_roles",
  "settings:manage_integrations",
  "integrations:voice_iq:manage",
  "subscriptions:view",
  "subscriptions:manage",
  "billing:view",
  "templates:view",
  "templates:create",
  "templates:activate",
  "templates:approve_outbound",
  "apps:manage",
  "dashboards:customize",
  "dashboards:view_org_wide",
  "tables:customize",
  "views:customize",
  "sources:manage",
  "agents:provision",
  "agents:approve_T2",
  "agents:approve_T3",
  "agents:suspend",
  "agents:view_activity",
  "directives:author",
  "directives:approve",
  "directives:view_org_wide",
  "support:create",
  "support:view",
  "audit:view",

  // ── Leads ────────────────────────────────────────────────────────────────
  "leads:view",
  "leads:create",
  "leads:edit",
  "leads:delete",
  "leads:assign",
  "leads:bulk_import",
  "leads:export",

  // ── Deals ────────────────────────────────────────────────────────────────
  "deals:view",
  "deals:create",
  "deals:edit",
  "deals:close_won",
  "deals:close_lost",

  // ── Contacts ─────────────────────────────────────────────────────────────
  "contacts:view",
  "contacts:create",
  "contacts:edit",
  "contacts:merge",

  // ── Activities / calls / campaigns ──────────────────────────────────────
  "activities:view",
  "activities:create",
  "activities:edit",
  "calls:view",
  "calls:listen",
  "calls:export",
  "campaigns:view",
  "campaigns:create",
  "campaigns:execute",

  // ── Site visits ─────────────────────────────────────────────────────────
  "site_visits:view",
  "site_visits:create",
  "site_visits:edit",
  "site_visits:cancel",

  // ── Documents / notes ───────────────────────────────────────────────────
  "documents:view",
  "documents:upload",
  "documents:verify",
  "documents:sign",
  "notes:view",
  "notes:create",
  "notes:edit",

  // ── Channel partner-specific ────────────────────────────────────────────
  "cp:submit_lead",
  "cp:view_own_submissions",
  "cp:view_commissions",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions that ONLY super_admin may hold. Allow-overrides for any of
 * these on a non-super_admin role are silently filtered at resolve time
 * (this file) AND rejected at write time by a Postgres trigger on
 * role_permission_overrides (belt-and-suspenders defense).
 */
export const PLATFORM_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "platform:manage",
  "organizations:create",
  "organizations:delete",
  "organizations:manage_admins",
  "organizations:manage_subscriptions",
  "platform_analytics:view",
  "platform_tickets:view",
  "platform_tickets:respond",
]);

// `organizations:view` and `organizations:edit` are NOT platform-only — they
// are shared between super_admin (manages all orgs at the platform level) and
// org_owner / org_admin (manages their own org's metadata). Per PRD §5.1.

// ── Permission groupings used by base + app role maps ──────────────────────

const READ_ONLY_OPERATIONAL: Permission[] = [
  "leads:view",
  "deals:view",
  "contacts:view",
  "activities:view",
  "calls:view",
  "campaigns:view",
  "site_visits:view",
  "documents:view",
  "notes:view",
];

const SALES_REP_OPERATIONAL: Permission[] = [
  ...READ_ONLY_OPERATIONAL,
  "leads:create",
  "leads:edit",
  "deals:create",
  "deals:edit",
  "contacts:create",
  "contacts:edit",
  "activities:create",
  "activities:edit",
  "site_visits:create",
  "site_visits:edit",
  "site_visits:cancel",
  "notes:create",
  "notes:edit",
  "documents:upload",
];

const MANAGER_OPERATIONAL: Permission[] = [
  ...SALES_REP_OPERATIONAL,
  "leads:assign",
  "leads:export",
  "contacts:merge",
  "deals:close_won",
  "deals:close_lost",
  "calls:listen",
  "calls:export",
  "audit:view",
];

const WORKSPACE_ADMIN_OPERATIONAL: Permission[] = [
  ...MANAGER_OPERATIONAL,
  "agents:approve_T2",
  "agents:approve_T3",
  "agents:view_activity",
  "templates:approve_outbound",
  "documents:verify",
  "documents:sign",
  // Bulk operations land at workspace_admin tier
  "leads:delete",
  "leads:bulk_import",
  "campaigns:create",
  "campaigns:execute",
];

const ORG_ADMIN_PLANE: Permission[] = [
  // Org-meta read+edit: shared with super_admin per PRD §5.1
  "organizations:view",
  "organizations:edit",
  "settings:manage_users",
  "settings:manage_roles",
  "settings:manage_integrations",
  "integrations:voice_iq:manage",
  "subscriptions:view",
  "audit:view",
  "support:create",
  "support:view",
  "templates:view",
  "templates:create",
  "templates:activate",
  "apps:manage",
  "dashboards:customize",
  "dashboards:view_org_wide",
  "tables:customize",
  "views:customize",
  "sources:manage",
  "agents:provision",
  "agents:suspend",
  "agents:view_activity",
  "directives:author",
  "directives:approve",
  "directives:view_org_wide",
];

const SUPER_ADMIN_PERMS: Permission[] = [
  "platform:manage",
  "organizations:view",
  "organizations:create",
  "organizations:edit",
  "organizations:delete",
  "organizations:manage_admins",
  "organizations:manage_subscriptions",
  "platform_analytics:view",
  "platform_tickets:view",
  "platform_tickets:respond",
  "audit:view",
];

const ORG_OWNER_PERMS: Permission[] = [
  ...ORG_ADMIN_PLANE,
  "subscriptions:manage",
  "billing:view",
];

const CHANNEL_PARTNER_PERMS: Permission[] = [
  "cp:submit_lead",
  "cp:view_own_submissions",
  "cp:view_commissions",
];

// ── Maps ───────────────────────────────────────────────────────────────────

export const BASE_ROLE_PERMS: Record<BaseRole, ReadonlySet<Permission>> = {
  super_admin: new Set(SUPER_ADMIN_PERMS),
  org_owner: new Set(ORG_OWNER_PERMS),
  org_admin: new Set(ORG_ADMIN_PLANE),
  workspace_admin: new Set(WORKSPACE_ADMIN_OPERATIONAL),
  manager: new Set(MANAGER_OPERATIONAL),
  sales_rep: new Set(SALES_REP_OPERATIONAL),
  read_only: new Set(READ_ONLY_OPERATIONAL),
  channel_partner: new Set(CHANNEL_PARTNER_PERMS),
  service_account: new Set<Permission>(),
};

export const APP_ROLE_PERMS: Record<AppRole, ReadonlySet<Permission>> = {
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
 * - Allow overrides for `PLATFORM_ONLY_PERMISSIONS` are silently filtered
 *   when applied to a non-super_admin role.
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
