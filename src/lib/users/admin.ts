import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  type AssignableBaseRole,
  type ChangeRoleInput,
  type DeactivateUserInput,
  type InviteUserInput,
  type ProfileRow,
  UsersAdminError,
} from "./types";

/**
 * D-018 — Users management server-only helpers.
 *
 * Uses service-role + caller_org_id filter on every read/write
 * (`caller-org-filter-on-service-role-mutation`, D-007).
 */

const SYSTEM_VIA = "manual" as const;

export async function listUsersInOrg(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ProfileRow[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, organization_id, email, display_name, base_role, created_at, deleted_at")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as ProfileRow[];
}

export type WorkspaceCountRow = { user_id: string; workspace_count: number };

export async function workspaceCountsForUsers(
  organization_id: string,
  user_ids: string[],
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (user_ids.length === 0) return map;
  const { data, error } = await client
    .from("user_app_roles")
    .select("user_id, workspace_id")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .in("user_id", user_ids);
  if (error || !data) return map;
  for (const r of data as Array<{ user_id: string; workspace_id: string | null }>) {
    if (r.workspace_id == null) continue;
    map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
  }
  return map;
}

async function findOwnOrgProfile(
  organization_id: string,
  user_id: string,
  client: SupabaseClient,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, organization_id, email, display_name, base_role, created_at, deleted_at")
    .eq("id", user_id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as ProfileRow | null) ?? null;
}

/**
 * Invite a new user. Creates the auth.users row + profiles row in the
 * caller's org. Idempotent on email (returns existing user_id).
 *
 * The caller is expected to share initial credentials offline; magic-link
 * invitation is V2.
 */
export async function inviteUser(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: InviteUserInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ user_id: string; created: boolean }> {
  const email = args.input.email.toLowerCase().trim();

  // Idempotency: did this email already become a user?
  const existing = await client
    .from("profiles")
    .select("id, organization_id, deleted_at")
    .eq("email", email)
    .maybeSingle();
  const existingRow = (existing as { data: { id: string; organization_id: string | null; deleted_at: string | null } | null }).data;

  if (existingRow) {
    if (
      existingRow.organization_id !== null &&
      existingRow.organization_id !== args.caller_org_id
    ) {
      throw new UsersAdminError(
        "Email already belongs to another organization",
        "duplicate_email",
      );
    }
    return { user_id: existingRow.id, created: false };
  }

  // Create auth user (Supabase admin SDK).
  type AdminAuth = {
    auth: {
      admin: {
        createUser: (a: { email: string; email_confirm: boolean }) => Promise<{
          data: { user: { id: string } | null };
          error: { message: string } | null;
        }>;
      };
    };
  };
  const created = await (client as unknown as AdminAuth).auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new UsersAdminError(
      created.error?.message ?? "Failed to create user",
      "invalid",
    );
  }
  const new_user_id = created.data.user.id;

  // Insert profile.
  const ins = await client.from("profiles").insert({
    id: new_user_id,
    organization_id: args.caller_org_id,
    email,
    display_name: args.input.display_name,
    base_role: args.input.base_role,
    created_by: args.actor_id,
    created_via: SYSTEM_VIA,
    updated_by: args.actor_id,
    updated_via: SYSTEM_VIA,
  });
  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) {
    throw new UsersAdminError(insErr.message, "invalid");
  }

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "profiles",
    record_id: new_user_id,
    action: "user_invited",
    diff: {
      email,
      display_name: args.input.display_name,
      base_role: args.input.base_role,
    },
  });

  return { user_id: new_user_id, created: true };
}

export async function changeBaseRole(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: ChangeRoleInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ user_id: string; from: string; to: AssignableBaseRole }> {
  if (args.input.user_id === args.actor_id) {
    throw new UsersAdminError("Cannot change your own role", "self_target");
  }
  const target = await findOwnOrgProfile(args.caller_org_id, args.input.user_id, client);
  if (!target) {
    throw new UsersAdminError(`User not found: ${args.input.user_id}`, "not_found");
  }
  if (target.base_role === "super_admin") {
    throw new UsersAdminError(
      "Cannot change role of a super_admin",
      "platform_user",
    );
  }
  if (target.base_role === args.input.base_role) {
    return { user_id: target.id, from: target.base_role, to: args.input.base_role };
  }

  const upd = await client
    .from("profiles")
    .update({
      base_role: args.input.base_role,
      updated_at: new Date().toISOString(),
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("id", target.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new UsersAdminError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "profiles",
    record_id: target.id,
    action: "user_role_changed",
    diff: {
      user_id: target.id,
      from: target.base_role,
      to: args.input.base_role,
    },
  });

  return { user_id: target.id, from: target.base_role, to: args.input.base_role };
}

export async function deactivateUser(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: DeactivateUserInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ user_id: string }> {
  if (args.input.user_id === args.actor_id) {
    throw new UsersAdminError("Cannot deactivate yourself", "self_target");
  }
  const target = await findOwnOrgProfile(args.caller_org_id, args.input.user_id, client);
  if (!target) {
    throw new UsersAdminError(`User not found: ${args.input.user_id}`, "not_found");
  }
  if (target.base_role === "super_admin") {
    throw new UsersAdminError("Cannot deactivate a super_admin", "platform_user");
  }

  const now = new Date().toISOString();
  const upd = await client
    .from("profiles")
    .update({
      deleted_at: now,
      deleted_by: args.actor_id,
      deleted_reason: args.input.reason ?? "deactivated by org admin",
      updated_at: now,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("id", target.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new UsersAdminError(updErr.message, "invalid");

  // Soft-delete bridge rows so the user loses every app role at once.
  await client
    .from("user_app_roles")
    .update({
      deleted_at: now,
      deleted_by: args.actor_id,
      deleted_reason: "user deactivated",
      updated_at: now,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("user_id", target.id)
    .eq("organization_id", args.caller_org_id)
    .is("deleted_at", null);

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "profiles",
    record_id: target.id,
    action: "user_deactivated",
    diff: { user_id: target.id, reason: args.input.reason ?? null },
  });

  return { user_id: target.id };
}
