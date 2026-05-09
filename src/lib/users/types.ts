import { z } from "zod";
import { GRANTABLE_APP_ROLES, BASE_ROLES, type BaseRole } from "@/lib/auth/types";

/**
 * Roles that can be assigned via the org-admin Users surface.
 * Excludes super_admin (platform-level only) and service_account (machine-only).
 */
export const ASSIGNABLE_BASE_ROLES = [
  "org_owner",
  "org_admin",
  "workspace_admin",
  "manager",
  "sales_rep",
  "read_only",
  "channel_partner",
] as const satisfies readonly BaseRole[];

export type AssignableBaseRole = (typeof ASSIGNABLE_BASE_ROLES)[number];

export const inviteUserInputSchema = z
  .object({
    email: z.string().email().max(254),
    display_name: z.string().min(1).max(120),
    base_role: z.enum(ASSIGNABLE_BASE_ROLES),
  })
  .strict();

export type InviteUserInput = z.infer<typeof inviteUserInputSchema>;

export const changeRoleInputSchema = z
  .object({
    user_id: z.string().uuid(),
    base_role: z.enum(ASSIGNABLE_BASE_ROLES),
  })
  .strict();

export type ChangeRoleInput = z.infer<typeof changeRoleInputSchema>;

export const deactivateUserInputSchema = z
  .object({
    user_id: z.string().uuid(),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();

export type DeactivateUserInput = z.infer<typeof deactivateUserInputSchema>;

export class UsersAdminError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "not_found"
      | "self_target"
      | "platform_user"
      | "duplicate_email"
      | "invalid",
  ) {
    super(message);
    this.name = "UsersAdminError";
  }
}

export type ProfileRow = {
  id: string;
  organization_id: string | null;
  email: string;
  display_name: string;
  base_role: BaseRole;
  created_at: string;
  deleted_at: string | null;
};

export const ALL_BASE_ROLES = BASE_ROLES;
export const APP_ROLE_OPTIONS = GRANTABLE_APP_ROLES;
