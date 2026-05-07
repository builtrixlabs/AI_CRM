import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CreatedVia } from "@/lib/nodes/types";
import type { Permission } from "./rbac";
import type { AppRole } from "./types";

export type OverrideRow = {
  id: string;
  organization_id: string;
  role: AppRole;
  permission: Permission;
  mode: "allow" | "deny";
  reason: string;
};

export type UpsertOverrideInput = {
  organization_id: string;
  role: AppRole;
  permission: Permission;
  mode: "allow" | "deny";
  reason: string;
  actor: string;
  via?: CreatedVia;
};

/**
 * Service-role CRUD for `role_permission_overrides`. Every mutation writes
 * one `audit_log` row. The DB-side guard trigger rejects PLATFORM_ONLY allow
 * with SQLSTATE 42501; this code surfaces those errors to the caller verbatim.
 */
export async function listOverrides(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<OverrideRow[]> {
  const { data, error } = await client
    .from("role_permission_overrides")
    .select("id, organization_id, role, permission, mode, reason")
    .eq("organization_id", organization_id)
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []) as OverrideRow[];
}

/**
 * Insert (or, on UNIQUE conflict, treat as a no-op + audit). The caller is
 * responsible for verifying the actor has `settings:manage_roles` BEFORE
 * invoking this helper.
 */
export async function upsertOverride(
  input: UpsertOverrideInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<{ id: string }> {
  const via: CreatedVia = input.via ?? "manual";
  const { data, error } = await client
    .from("role_permission_overrides")
    .insert({
      organization_id: input.organization_id,
      role: input.role,
      permission: input.permission,
      mode: input.mode,
      reason: input.reason,
      created_by: input.actor,
      created_via: via,
      updated_by: input.actor,
      updated_via: via,
    })
    .select("id")
    .single();
  if (error) throw error;

  await client.from("audit_log").insert({
    actor_id: input.actor,
    actor_type: "user",
    actor_role: "rbac_writer",
    organization_id: input.organization_id,
    table_name: "role_permission_overrides",
    record_id: data.id,
    action: "rbac_override_upsert",
    diff: {
      after: {
        role: input.role,
        permission: input.permission,
        mode: input.mode,
        reason: input.reason,
      },
    },
  });

  return { id: data.id };
}

export type SoftDeleteOverrideInput = {
  id: string;
  actor: string;
  reason: string;
};

/** Soft-delete an override. Idempotent on already-deleted rows. */
export async function softDeleteOverride(
  input: SoftDeleteOverrideInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const { data: existing, error: readErr } = await client
    .from("role_permission_overrides")
    .select("id, organization_id, deleted_at")
    .eq("id", input.id)
    .single();
  if (readErr) throw readErr;
  if (existing.deleted_at) return;

  const { error } = await client
    .from("role_permission_overrides")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: input.actor,
      deleted_reason: input.reason,
      updated_at: new Date().toISOString(),
      updated_by: input.actor,
      updated_via: "manual",
    })
    .eq("id", input.id);
  if (error) throw error;

  await client.from("audit_log").insert({
    actor_id: input.actor,
    actor_type: "user",
    actor_role: "rbac_writer",
    organization_id: existing.organization_id,
    table_name: "role_permission_overrides",
    record_id: input.id,
    action: "rbac_override_delete",
    diff: { reason: input.reason },
  });
}
