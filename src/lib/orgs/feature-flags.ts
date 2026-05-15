/**
 * v6.2.1 — per-organization feature flag reader.
 *
 * Flags live in `organizations.feature_flags` (jsonb, added in
 * 20260515130500_organizations_feature_flags.sql). This helper is the only
 * place the app reads them — keep additions narrowly typed via FeatureFlag.
 *
 * Default-off semantics: a missing key, a non-boolean value, or a missing
 * org row all resolve to `false`. There is no error-throwing path —
 * callers can rely on "false on any failure" without try/catch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FeatureFlag =
  /** v6.2.1 — split-pane lead canvas with inline AI Drafts approval tab. */
  | "lead_canvas_v2";

export type OrgFeatureFlags = Partial<Record<FeatureFlag, boolean>>;

export async function getFeatureFlag(
  organization_id: string | null,
  flag: FeatureFlag,
  client?: SupabaseClient,
): Promise<boolean> {
  if (!organization_id) return false;
  const supabase = client ?? getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organizations")
    .select("feature_flags")
    .eq("id", organization_id)
    .maybeSingle();
  if (error || !data) return false;
  const flags = (data as { feature_flags: OrgFeatureFlags | null })
    .feature_flags;
  return flags?.[flag] === true;
}

/** Load the full feature-flag bag for an org. Used when you need to check
 *  several flags in one round-trip (e.g. dashboard renders that fork on
 *  multiple flags). Returns an empty object on any failure. */
export async function getFeatureFlags(
  organization_id: string | null,
  client?: SupabaseClient,
): Promise<OrgFeatureFlags> {
  if (!organization_id) return {};
  const supabase = client ?? getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organizations")
    .select("feature_flags")
    .eq("id", organization_id)
    .maybeSingle();
  if (error || !data) return {};
  return (
    ((data as { feature_flags: OrgFeatureFlags | null }).feature_flags) ?? {}
  );
}
