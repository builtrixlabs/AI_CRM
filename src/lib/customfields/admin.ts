import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CustomFieldError,
  type CreateFieldInput,
  type CustomFieldNodeType,
  type CustomFieldRow,
  type DeleteFieldInput,
  type UpdateFieldInput,
} from "./types";

const SYSTEM_VIA = "manual" as const;

export async function listFieldsForOrg(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<CustomFieldRow[]> {
  const { data, error } = await client
    .from("custom_field_definitions")
    .select(
      "id, organization_id, node_type, field_key, label, kind, required, options, sort_order, created_at, deleted_at",
    )
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("node_type", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as CustomFieldRow[];
}

export async function listFieldsForType(
  organization_id: string,
  node_type: CustomFieldNodeType,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<CustomFieldRow[]> {
  const { data, error } = await client
    .from("custom_field_definitions")
    .select(
      "id, organization_id, node_type, field_key, label, kind, required, options, sort_order, created_at, deleted_at",
    )
    .eq("organization_id", organization_id)
    .eq("node_type", node_type)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as CustomFieldRow[];
}

async function findOwnRow(
  organization_id: string,
  id: string,
  client: SupabaseClient,
): Promise<CustomFieldRow | null> {
  const { data, error } = await client
    .from("custom_field_definitions")
    .select(
      "id, organization_id, node_type, field_key, label, kind, required, options, sort_order, created_at, deleted_at",
    )
    .eq("id", id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as CustomFieldRow | null) ?? null;
}

export async function createField(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: CreateFieldInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  // Idempotency: same (org, node_type, field_key) is the unique key.
  const { data: existing } = await client
    .from("custom_field_definitions")
    .select("id")
    .eq("organization_id", args.caller_org_id)
    .eq("node_type", args.input.node_type)
    .eq("field_key", args.input.field_key)
    .is("deleted_at", null)
    .maybeSingle();
  if ((existing as { id: string } | null)) {
    throw new CustomFieldError(
      `Field key already exists: ${args.input.field_key}`,
      "duplicate_key",
    );
  }

  const ins = await client
    .from("custom_field_definitions")
    .insert({
      organization_id: args.caller_org_id,
      node_type: args.input.node_type,
      field_key: args.input.field_key,
      label: args.input.label,
      kind: args.input.kind,
      required: args.input.required ?? false,
      options: args.input.options ?? [],
      sort_order: args.input.sort_order ?? 0,
      created_by: args.actor_id,
      created_via: SYSTEM_VIA,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .select("id")
    .single();
  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) throw new CustomFieldError(insErr.message, "invalid");
  const inserted = (ins as { data: { id: string } }).data;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "custom_field_definitions",
    record_id: inserted.id,
    action: "custom_field_created",
    diff: {
      node_type: args.input.node_type,
      field_key: args.input.field_key,
      kind: args.input.kind,
    },
  });

  return { id: inserted.id };
}

export async function updateField(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: UpdateFieldInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const target = await findOwnRow(args.caller_org_id, args.input.id, client);
  if (!target) {
    throw new CustomFieldError(`Field not found: ${args.input.id}`, "not_found");
  }
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: args.actor_id,
    updated_via: SYSTEM_VIA,
  };
  if (args.input.label !== undefined) update.label = args.input.label;
  if (args.input.required !== undefined) update.required = args.input.required;
  if (args.input.options !== undefined) update.options = args.input.options;
  if (args.input.sort_order !== undefined)
    update.sort_order = args.input.sort_order;

  const upd = await client
    .from("custom_field_definitions")
    .update(update)
    .eq("id", target.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new CustomFieldError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "custom_field_definitions",
    record_id: target.id,
    action: "custom_field_updated",
    diff: {
      field_key: target.field_key,
      changed: Object.keys(update).filter(
        (k) => !["updated_at", "updated_by", "updated_via"].includes(k),
      ),
    },
  });

  return { id: target.id };
}

export async function deleteField(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: DeleteFieldInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const target = await findOwnRow(args.caller_org_id, args.input.id, client);
  if (!target) {
    throw new CustomFieldError(`Field not found: ${args.input.id}`, "not_found");
  }
  const now = new Date().toISOString();
  const upd = await client
    .from("custom_field_definitions")
    .update({
      deleted_at: now,
      deleted_by: args.actor_id,
      deleted_reason: "removed by org admin",
      updated_at: now,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("id", target.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new CustomFieldError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "custom_field_definitions",
    record_id: target.id,
    action: "custom_field_deleted",
    diff: {
      node_type: target.node_type,
      field_key: target.field_key,
    },
  });

  return { id: target.id };
}
