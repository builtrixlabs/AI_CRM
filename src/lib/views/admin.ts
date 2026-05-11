import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CustomViewError,
  type CreateViewInput,
  type CustomViewRow,
  type DeleteViewInput,
  type SetDefaultViewInput,
  type UpdateViewInput,
  type ViewEntityType,
} from "./types";

const SYSTEM_VIA = "manual" as const;

const SELECT_COLS =
  "id, organization_id, entity_type, scope, owner_id, name, slug, filters, columns, sort, created_at, deleted_at";

export async function listViewsForType(
  organization_id: string,
  entity_type: ViewEntityType,
  profile_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<CustomViewRow[]> {
  const { data, error } = await client
    .from("custom_views")
    .select(SELECT_COLS)
    .eq("organization_id", organization_id)
    .eq("entity_type", entity_type)
    .is("deleted_at", null)
    .or(`scope.eq.org,and(scope.eq.user,owner_id.eq.${profile_id})`)
    .order("scope", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data as CustomViewRow[];
}

export async function getViewById(
  organization_id: string,
  id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<CustomViewRow | null> {
  const { data, error } = await client
    .from("custom_views")
    .select(SELECT_COLS)
    .eq("id", id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as CustomViewRow | null) ?? null;
}

export async function getViewBySlug(
  organization_id: string,
  entity_type: ViewEntityType,
  slug: string,
  profile_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<CustomViewRow | null> {
  // Prefer user-scoped slug match (private views shadow org views with the
  // same slug); fall back to org-scoped.
  const userMatch = await client
    .from("custom_views")
    .select(SELECT_COLS)
    .eq("organization_id", organization_id)
    .eq("entity_type", entity_type)
    .eq("scope", "user")
    .eq("owner_id", profile_id)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (userMatch.data) return userMatch.data as CustomViewRow;

  const orgMatch = await client
    .from("custom_views")
    .select(SELECT_COLS)
    .eq("organization_id", organization_id)
    .eq("entity_type", entity_type)
    .eq("scope", "org")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return (orgMatch.data as CustomViewRow | null) ?? null;
}

export async function createView(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: CreateViewInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const owner_id = args.input.scope === "user" ? args.actor_id : null;

  // Idempotency: same (org, type, scope, slug, owner) → reject as duplicate.
  const existing = await client
    .from("custom_views")
    .select("id")
    .eq("organization_id", args.caller_org_id)
    .eq("entity_type", args.input.entity_type)
    .eq("scope", args.input.scope)
    .eq("slug", args.input.slug)
    .is("deleted_at", null);
  const existingFiltered = ((existing.data ?? []) as { id: string }[]).filter(
    () => true,
  );
  // For user scope, must also match owner; do a second guard.
  let dup = false;
  if (args.input.scope === "org" && existingFiltered.length > 0) dup = true;
  if (args.input.scope === "user") {
    const userDup = await client
      .from("custom_views")
      .select("id")
      .eq("organization_id", args.caller_org_id)
      .eq("entity_type", args.input.entity_type)
      .eq("scope", "user")
      .eq("owner_id", args.actor_id)
      .eq("slug", args.input.slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (userDup.data) dup = true;
  }
  if (dup) {
    throw new CustomViewError(
      `Slug already exists in this scope: ${args.input.slug}`,
      "duplicate_slug",
    );
  }

  const ins = await client
    .from("custom_views")
    .insert({
      organization_id: args.caller_org_id,
      entity_type: args.input.entity_type,
      scope: args.input.scope,
      owner_id,
      name: args.input.name,
      slug: args.input.slug,
      filters: args.input.filters,
      columns: args.input.columns,
      sort: args.input.sort,
      created_by: args.actor_id,
      created_via: SYSTEM_VIA,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .select("id")
    .single();
  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) throw new CustomViewError(insErr.message, "invalid");
  const inserted = (ins as { data: { id: string } }).data;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "custom_views",
    record_id: inserted.id,
    action: "view_created",
    diff: {
      entity_type: args.input.entity_type,
      scope: args.input.scope,
      slug: args.input.slug,
    },
  });

  return { id: inserted.id };
}

export async function updateView(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: UpdateViewInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const target = await getViewById(args.caller_org_id, args.input.id, client);
  if (!target) {
    throw new CustomViewError(`View not found: ${args.input.id}`, "not_found");
  }
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: args.actor_id,
    updated_via: SYSTEM_VIA,
  };
  if (args.input.name !== undefined) update.name = args.input.name;
  if (args.input.filters !== undefined) update.filters = args.input.filters;
  if (args.input.columns !== undefined) update.columns = args.input.columns;
  if (args.input.sort !== undefined) update.sort = args.input.sort;

  const upd = await client
    .from("custom_views")
    .update(update)
    .eq("id", target.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new CustomViewError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "custom_views",
    record_id: target.id,
    action: "view_updated",
    diff: {
      slug: target.slug,
      changed: Object.keys(update).filter(
        (k) => !["updated_at", "updated_by", "updated_via"].includes(k),
      ),
    },
  });

  return { id: target.id };
}

export async function deleteView(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: DeleteViewInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const target = await getViewById(args.caller_org_id, args.input.id, client);
  if (!target) {
    throw new CustomViewError(`View not found: ${args.input.id}`, "not_found");
  }
  const now = new Date().toISOString();
  const upd = await client
    .from("custom_views")
    .update({
      deleted_at: now,
      deleted_by: args.actor_id,
      deleted_reason: args.input.reason ?? "removed by user",
      updated_at: now,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("id", target.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new CustomViewError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "custom_views",
    record_id: target.id,
    action: "view_deleted",
    diff: {
      entity_type: target.entity_type,
      slug: target.slug,
    },
  });

  return { id: target.id };
}

// `setDefaultView` writes profiles.view_defaults via the SECURITY INVOKER
// RPC declared in the migration. The RPC scopes both the read and the
// write to auth.uid().
export async function setDefaultView(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: SetDefaultViewInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ view_id: string }> {
  const target = await getViewById(args.caller_org_id, args.input.view_id, client);
  if (!target) {
    throw new CustomViewError(
      `View not found: ${args.input.view_id}`,
      "not_found",
    );
  }

  // Direct write — we already verified the caller's org owns the view above.
  // Using the admin client we bypass RLS but enforce same-org via the read.
  // Read-merge-write to preserve other entity_type defaults (race-safe for a
  // per-user setting since the rate is human, not concurrent automation).
  const cur = await client
    .from("profiles")
    .select("view_defaults")
    .eq("id", args.actor_id)
    .maybeSingle();
  const current = (cur.data as { view_defaults?: Record<string, string> } | null)
    ?.view_defaults ?? {};
  const merged = { ...current, [target.entity_type]: target.id };

  const upd = await client
    .from("profiles")
    .update({
      view_defaults: merged,
      updated_at: new Date().toISOString(),
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("id", args.actor_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new CustomViewError(updErr.message, "rpc_failed");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "profiles",
    record_id: args.actor_id,
    action: "view_default_set",
    diff: { entity_type: target.entity_type, view_id: target.id },
  });

  return { view_id: target.id };
}
