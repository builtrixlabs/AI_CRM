import type { SupabaseClient } from "@supabase/supabase-js";

export const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Resolve a lead within the caller's organization. Returns the lead's
 * workspace_id when found and tenant matches; null otherwise (cross-tenant
 * lookups fail closed — Constitution II).
 */
export async function leadInOrg(
  client: SupabaseClient,
  organization_id: string,
  lead_id: string
): Promise<{ workspace_id: string } | null> {
  const { data, error } = await client
    .from("nodes")
    .select("workspace_id")
    .eq("id", lead_id)
    .eq("node_type", "lead")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return { workspace_id: (data as { workspace_id: string }).workspace_id };
}

/**
 * Read the `data` JSONB of a node (any node_type).
 */
export async function readNodeData(
  client: SupabaseClient,
  node_id: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client
    .from("nodes")
    .select("data")
    .eq("id", node_id)
    .single();
  if (error || !data) return null;
  return ((data.data ?? {}) as Record<string, unknown>);
}
