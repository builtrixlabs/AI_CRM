/**
 * D-611 — versioning helpers. A "new version" is a fresh `directives`
 * row with `parent_id = source.id`, `version = source.version + 1`,
 * `lifecycle_status='draft'`. "Revert to v(n-1)" flips the chosen
 * historical row's lifecycle back to `live` + archives the current live.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type DirectiveRow = {
  id: string;
  organization_id: string;
  code: string;
  display_name: string;
  trigger_kind: string;
  trigger_config: Record<string, unknown>;
  action_kind: string;
  action_config: Record<string, unknown>;
  tier: string;
  enabled: boolean;
  version: number;
  parent_id: string | null;
  compiled_dag: Record<string, unknown> | null;
  lifecycle_status: string;
};

/**
 * Clone `source_id` into a new draft row.
 */
export async function createNewVersion(args: {
  caller_org_id: string;
  source_id: string;
  actor_id: string;
  client?: SupabaseClient;
}): Promise<
  | { ok: true; id: string; version: number }
  | { ok: false; reason: "not_found" | string }
> {
  const client = args.client ?? getSupabaseAdmin();
  const { data, error } = await client
    .from("directives")
    .select(
      "id, organization_id, code, display_name, trigger_kind, trigger_config, action_kind, action_config, tier, enabled, version, parent_id, compiled_dag, lifecycle_status",
    )
    .eq("id", args.source_id)
    .eq("organization_id", args.caller_org_id)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: "not_found" };
  const source = data as DirectiveRow;

  const nextVersion = (source.version ?? 1) + 1;

  const ins = await client
    .from("directives")
    .insert({
      organization_id: args.caller_org_id,
      code: source.code,
      display_name: source.display_name,
      trigger_kind: source.trigger_kind,
      trigger_config: source.trigger_config,
      action_kind: source.action_kind,
      action_config: source.action_config,
      tier: source.tier,
      enabled: false,
      version: nextVersion,
      parent_id: source.id,
      compiled_dag: source.compiled_dag,
      lifecycle_status: "draft",
      created_by: args.actor_id,
      updated_by: args.actor_id,
    })
    .select("id, version")
    .single();
  if (ins.error) return { ok: false, reason: ins.error.message };
  const row = ins.data as { id: string; version: number };
  return { ok: true, id: row.id, version: row.version };
}

/**
 * Demote the current `live` revision in the chain to `archived` and
 * promote the named historical revision to `live`. No-op when the
 * target is already live.
 */
export async function revertToVersion(args: {
  caller_org_id: string;
  target_id: string;
  client?: SupabaseClient;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_live" | string }
> {
  const client = args.client ?? getSupabaseAdmin();
  const target = await client
    .from("directives")
    .select("id, organization_id, code, lifecycle_status")
    .eq("id", args.target_id)
    .eq("organization_id", args.caller_org_id)
    .maybeSingle();
  if (target.error) return { ok: false, reason: target.error.message };
  if (!target.data) return { ok: false, reason: "not_found" };
  const t = target.data as {
    id: string;
    organization_id: string;
    code: string;
    lifecycle_status: string;
  };
  if (t.lifecycle_status === "live") return { ok: false, reason: "already_live" };

  // Demote the current live revision in the same code chain.
  const demote = await client
    .from("directives")
    .update({ lifecycle_status: "archived" })
    .eq("organization_id", args.caller_org_id)
    .eq("code", t.code)
    .eq("lifecycle_status", "live");
  if (demote.error) return { ok: false, reason: demote.error.message };

  const promote = await client
    .from("directives")
    .update({ lifecycle_status: "live", enabled: true })
    .eq("id", t.id)
    .eq("organization_id", args.caller_org_id);
  if (promote.error) return { ok: false, reason: promote.error.message };

  return { ok: true };
}

/**
 * List the version history for a directive code in an org, oldest first.
 */
export async function listVersionHistory(args: {
  caller_org_id: string;
  code: string;
  client?: SupabaseClient;
}): Promise<Array<{
  id: string;
  version: number;
  lifecycle_status: string;
  parent_id: string | null;
  created_at: string;
}>> {
  const client = args.client ?? getSupabaseAdmin();
  const { data } = await client
    .from("directives")
    .select("id, version, lifecycle_status, parent_id, created_at")
    .eq("organization_id", args.caller_org_id)
    .eq("code", args.code)
    .order("version", { ascending: true });
  return (data ?? []) as Array<{
    id: string;
    version: number;
    lifecycle_status: string;
    parent_id: string | null;
    created_at: string;
  }>;
}
