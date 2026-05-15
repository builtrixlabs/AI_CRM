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
  // D-614 — configure the per-agent-kind auto-send vs require-approval policy.
  "agents:manage_policies",
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
  // D-602 (V6 Phase 1) — coordinator dashboard + sales-rep assignment.
  "site_visits:coordinate",
  "site_visits:assign",

  // ── Projects (D-608) ────────────────────────────────────────────────────
  "projects:assign_sales",

  // ── Lead allocation (D-610) ─────────────────────────────────────────────
  "allocation_rules:manage",

  // ── Brochures (D-607) ───────────────────────────────────────────────────
  "brochures:view",
  "brochures:upload",
  "brochures:delete",

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
  // D-607 — the brochure repository is readable by every operational role
  // (cascades to sales_rep / manager / workspace_admin / phone-rep roles).
  "brochures:view",
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
  // D-602 — managers assign sales reps to site visits.
  "site_visits:assign",
  // D-608 — managers map sales reps to projects.
  "projects:assign_sales",
  // D-610 — managers configure lead-allocation rules.
  "allocation_rules:manage",
  // D-607 — managers upload brochures to the repository (cascades to
  // workspace_admin).
  "brochures:upload",
  // D-615 — managers author AI workflows; a manager-authored workflow
  // lands pending_approval (runtime-inert) until an org admin approves.
  // Cascades to workspace_admin.
  "directives:author",
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
  // D-607 — workspace admins can delete brochures from the repository.
  "brochures:delete",
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
  // D-614 — org admin owns the agent send-policy surface.
  "agents:manage_policies",
  "directives:author",
  "directives:approve",
  "directives:view_org_wide",
  // D-602 (V6 Phase 1) — org admin oversees the site-visit module.
  "site_visits:view",
  "site_visits:coordinate",
  "site_visits:assign",
  // D-608 — org admin oversees project <-> sales-rep mapping.
  "projects:assign_sales",
  // D-610 — org admin oversees lead-allocation rules.
  "allocation_rules:manage",
  // D-607 — org admin owns the brochure repository surface.
  "brochures:view",
  "brochures:upload",
  "brochures:delete",
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

// ── V6 role permission sets (D-602, implementation-order §6) ───────────────

// presales_rep / telemarketing_rep / customer_recovery_rep are all
// phone-first rep roles — the sales_rep operational surface plus call
// listening. Their dedicated dashboards/queues land in D-605 / D-610 /
// D-616; D-602 only needs the enum values usable so effectivePermissions
// never resolves an undefined set.
const PHONE_REP_OPERATIONAL: Permission[] = [
  ...SALES_REP_OPERATIONAL,
  "calls:listen",
];

// site_visit_coordinator owns cab logistics — a focused read surface plus
// the site-visit coordinate / assign / edit perms. No lead/deal write.
const SITE_VISIT_COORDINATOR_OPERATIONAL: Permission[] = [
  "leads:view",
  "contacts:view",
  "activities:view",
  "calls:view",
  "site_visits:view",
  "site_visits:edit",
  "site_visits:coordinate",
  "site_visits:assign",
  "notes:view",
  "notes:create",
  // D-607 — coordinators can view brochures (read-only).
  "brochures:view",
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
  // D-602 (V6 Phase 1) — implementation-order §6 role extension.
  presales_rep: new Set(PHONE_REP_OPERATIONAL),
  telemarketing_rep: new Set(PHONE_REP_OPERATIONAL),
  customer_recovery_rep: new Set(PHONE_REP_OPERATIONAL),
  site_visit_coordinator: new Set(SITE_VISIT_COORDINATOR_OPERATIONAL),
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
