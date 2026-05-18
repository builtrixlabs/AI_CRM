import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  type CreateDashboardInput,
  DashboardError,
  type DashboardRow,
  type DeleteDashboardInput,
  type UpdateLayoutInput,
} from "./types";

const SYSTEM_VIA = "manual" as const;

export async function listDashboards(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<DashboardRow[]> {
  const { data, error } = await client
    .from("dashboard_definitions")
    .select("id, organization_id, name, layout, created_at, deleted_at")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as DashboardRow[];
}

export async function getDashboard(
  organization_id: string,
  id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<DashboardRow | null> {
  const { data, error } = await client
    .from("dashboard_definitions")
    .select("id, organization_id, name, layout, created_at, deleted_at")
    .eq("id", id)
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as DashboardRow | null) ?? null;
}

export async function createDashboard(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: CreateDashboardInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const ins = await client
    .from("dashboard_definitions")
    .insert({
      organization_id: args.caller_org_id,
      name: args.input.name,
      layout: args.input.layout,
      created_by: args.actor_id,
      created_via: SYSTEM_VIA,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .select("id")
    .single();
  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) throw new DashboardError(insErr.message, "invalid");
  const inserted = (ins as { data: { id: string } }).data;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "dashboard_definitions",
    record_id: inserted.id,
    action: "dashboard_created",
    diff: { name: args.input.name, widgets: args.input.layout.widgets.map((w) => w.type) },
  });
  return { id: inserted.id };
}

export async function updateDashboardLayout(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: UpdateLayoutInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const target = await getDashboard(args.caller_org_id, args.input.id, client);
  if (!target) {
    throw new DashboardError(`Dashboard not found: ${args.input.id}`, "not_found");
  }
  const update: Record<string, unknown> = {
    layout: args.input.layout,
    updated_at: new Date().toISOString(),
    updated_by: args.actor_id,
    updated_via: SYSTEM_VIA,
  };
  if (args.input.name !== undefined) update.name = args.input.name;

  const upd = await client
    .from("dashboard_definitions")
    .update(update)
    .eq("id", target.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new DashboardError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "dashboard_definitions",
    record_id: target.id,
    action: "dashboard_updated",
    diff: {
      name: args.input.name ?? target.name,
      widgets: args.input.layout.widgets.map((w) => w.type),
    },
  });
  return { id: target.id };
}

export async function deleteDashboard(
  args: {
    caller_org_id: string;
    actor_id: string;
    actor_role: string;
    input: DeleteDashboardInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const target = await getDashboard(args.caller_org_id, args.input.id, client);
  if (!target) {
    throw new DashboardError(`Dashboard not found: ${args.input.id}`, "not_found");
  }
  const now = new Date().toISOString();
  const upd = await client
    .from("dashboard_definitions")
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
  if (updErr) throw new DashboardError(updErr.message, "invalid");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "dashboard_definitions",
    record_id: target.id,
    action: "dashboard_deleted",
    diff: { name: target.name },
  });
  return { id: target.id };
}
