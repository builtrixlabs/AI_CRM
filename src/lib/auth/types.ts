/**
 * Authoritative auth type definitions.
 * `Permission` is a literal union exported from `./rbac` (D-003).
 */

export const BASE_ROLES = [
  "super_admin",
  "org_owner",
  "org_admin",
  "workspace_admin",
  "manager",
  "sales_rep",
  "read_only",
  "channel_partner",
  "service_account",
] as const;

export type BaseRole = (typeof BASE_ROLES)[number];

export const GRANTABLE_APP_ROLES = [
  "org_owner",
  "org_admin",
  "workspace_admin",
  "manager",
  "sales_rep",
  "read_only",
  "channel_partner",
] as const;

export type AppRole = (typeof GRANTABLE_APP_ROLES)[number];

export type AppRoleAssignment = {
  workspace_id: string | null;
  app_role: AppRole;
};

export type CurrentUser = {
  user: { id: string; email: string };
  profile: { id: string; display_name: string; base_role: BaseRole };
  org_id: string | null;
  workspace_ids: string[];
  app_roles: AppRoleAssignment[];
};
