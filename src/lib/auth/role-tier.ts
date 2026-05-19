/**
 * Role tier classification for UI surfaces (Builtrix Command shell).
 *
 * The CRM has 13 base roles. For day-to-day operator UX, they collapse
 * into three tiers that drive what nav + dashboard a user sees:
 *
 *   - "admin"   → org/workspace/super admins. Full surface.
 *   - "manager" → managers. Team rollup view, can also see admin-ish reports.
 *   - "agent"   → individual contributors (every *_rep + coordinator).
 *                 Sees a focused "today / my queue" dashboard.
 *
 * Everything else (read_only, channel_partner, service_account) falls
 * back to "agent" — the agent dashboard is read-tolerant (no destructive
 * actions surfaced) and is the safest default. Permissions still gate
 * actual capabilities at the route/RPC layer; this only picks the visual
 * shell.
 */
import type { BaseRole } from "./types";

export type RoleTier = "admin" | "manager" | "agent";

const ADMIN_ROLES: ReadonlySet<BaseRole> = new Set<BaseRole>([
  "super_admin",
  "org_owner",
  "org_admin",
  "workspace_admin",
]);

const MANAGER_ROLES: ReadonlySet<BaseRole> = new Set<BaseRole>(["manager"]);

export function resolveRoleTier(baseRole: BaseRole | null | undefined): RoleTier {
  if (!baseRole) return "agent";
  if (ADMIN_ROLES.has(baseRole)) return "admin";
  if (MANAGER_ROLES.has(baseRole)) return "manager";
  return "agent";
}

/**
 * Human-friendly label for the role chip in the topbar.
 * Falls back to the raw base_role with snake→title-case if unknown.
 */
export function formatRoleLabel(baseRole: BaseRole | null | undefined): string {
  if (!baseRole) return "Member";
  const map: Partial<Record<BaseRole, string>> = {
    super_admin: "Super Admin",
    org_owner: "Org Owner",
    org_admin: "Org Admin",
    workspace_admin: "Workspace Admin",
    manager: "Manager",
    sales_rep: "Sales Rep",
    read_only: "Read Only",
    channel_partner: "Channel Partner",
    service_account: "Service Account",
    presales_rep: "Presales Rep",
    telemarketing_rep: "Telemarketing Rep",
    customer_recovery_rep: "Recovery Rep",
    site_visit_coordinator: "Site Visit Coordinator",
  };
  return (
    map[baseRole] ??
    baseRole
      .split("_")
      .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
      .join(" ")
  );
}
