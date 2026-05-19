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
  // D-602 (V6 Phase 1) — implementation-order §6 role extension. Mirrors
  // the ALTER TYPE base_role ADD VALUE order in
  // supabase/migrations/20260514130000_v6_role_extensions.sql.
  "presales_rep",
  "telemarketing_rep",
  "customer_recovery_rep",
  "site_visit_coordinator",
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

export type NotificationPrefs = {
  email_enabled?: boolean;
  in_app_enabled?: boolean;
  digest_frequency?: "off" | "daily" | "weekly";
};

/**
 * D-606 — active super-admin impersonation context, overlaid on
 * `getCurrentUser()` when a valid impersonation_session cookie is present
 * AND the underlying auth user still holds `platform:manage`.
 *
 * When `impersonation` is non-null, the returned `CurrentUser` carries:
 *   - `org_id` = the impersonated org
 *   - `profile.base_role` = `org_admin`
 *   - `user.user.id` / `profile.id` = the super admin's real ids (so
 *     `audit_log.actor_id` writes preserve provenance — the `on_behalf_of`
 *     column carries the impersonated org_id).
 */
export type Impersonation = {
  impersonator_id: string;
  organization_id: string;
  organization_name?: string | null;
  started_at: string;
  expires_at: string;
};

export type CurrentUser = {
  user: { id: string; email: string };
  profile: {
    id: string;
    display_name: string;
    base_role: BaseRole;
    phone?: string | null;
    notification_prefs?: NotificationPrefs;
    theme?: "light" | "dark" | "system";
    mfa_verified_at?: string | null;
    mfa_enrolled_at?: string | null;
    /** D-413: per-user default view per entity_type. `{ "lead": "<uuid>", ... }`. */
    view_defaults?: Record<string, string>;
  };
  org_id: string | null;
  workspace_ids: string[];
  app_roles: AppRoleAssignment[];
  /** D-606 — non-null iff the request is inside an active impersonation. */
  impersonation?: Impersonation | null;
};
