/**
 * D-606 — per-org feature flags. Stored in `organizations.feature_flags`
 * jsonb. Helpers:
 *   - getOrgFeatureFlags(org_id) → Record<string, unknown>
 *   - setOrgFeatureFlag(org_id, flag, value, actor_id) → ok | err
 *   - isFeatureEnabled(org_id, flag, default = false) → boolean
 *
 * The jsonb is intentionally schemaless — different flags can carry
 * different shapes. `isFeatureEnabled` coerces non-boolean values to
 * the supplied default so callers always get a clean boolean.
 *
 * Caching: D-606 ships uncached reads (one DB roundtrip per call). The
 * V6 pilot's request volume is low enough this is fine; per-org caching
 * with TTL is a V6.x perf knob.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FeatureFlags = Record<string, unknown>;

export async function getOrgFeatureFlags(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<FeatureFlags> {
  const { data } = await client
    .from("organizations")
    .select("feature_flags")
    .eq("id", organization_id)
    .maybeSingle();
  if (!data) return {};
  const ff = (data as { feature_flags: unknown }).feature_flags;
  if (ff && typeof ff === "object" && !Array.isArray(ff)) {
    return ff as FeatureFlags;
  }
  return {};
}

/** Boolean coercion: only `true` (boolean) is enabled; everything else
 *  (false, missing, null, string, number, object) falls back to `def`. */
export async function isFeatureEnabled(
  organization_id: string,
  flag: string,
  def: boolean = false,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<boolean> {
  const ff = await getOrgFeatureFlags(organization_id, client);
  const v = ff[flag];
  if (v === true) return true;
  if (v === false) return false;
  return def;
}

export async function setOrgFeatureFlag(args: {
  organization_id: string;
  flag: string;
  value: unknown;
  client?: SupabaseClient;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" | string }> {
  const client = args.client ?? getSupabaseAdmin();
  const current = await getOrgFeatureFlags(args.organization_id, client);
  const next: FeatureFlags = { ...current, [args.flag]: args.value };

  const { data, error } = await client
    .from("organizations")
    .update({ feature_flags: next })
    .eq("id", args.organization_id)
    .select("id");
  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

export async function deleteOrgFeatureFlag(args: {
  organization_id: string;
  flag: string;
  client?: SupabaseClient;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" | string }> {
  const client = args.client ?? getSupabaseAdmin();
  const current = await getOrgFeatureFlags(args.organization_id, client);
  if (!(args.flag in current)) return { ok: true };
  const next: FeatureFlags = { ...current };
  delete next[args.flag];

  const { data, error } = await client
    .from("organizations")
    .update({ feature_flags: next })
    .eq("id", args.organization_id)
    .select("id");
  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
