import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FlagValue = string | number | boolean;

export type FlagRow = {
  key: string;
  value: FlagValue;
  description: string | null;
  updated_at: string;
};

const TYPED_KEYS = [
  "force_mfa",
  "demo_mode",
  "voice_iq_platform_enabled",
  "default_token_budget_per_org_per_month",
] as const;
export type FlagKey = (typeof TYPED_KEYS)[number] | (string & {});

function isFlagValue(v: unknown): v is FlagValue {
  return (
    typeof v === "string" || typeof v === "number" || typeof v === "boolean"
  );
}

export async function getFlag<T extends FlagValue>(
  key: FlagKey,
  fallback: T,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<T> {
  const { data, error } = await client
    .from("platform_flags")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  const v = (data as { value: unknown }).value;
  if (!isFlagValue(v)) return fallback;
  // T is a structural subtype; we trust the call site to match the seeded type.
  return v as T;
}

export async function listFlags(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<FlagRow[]> {
  const { data, error } = await client
    .from("platform_flags")
    .select("key, value, description, updated_at")
    .order("key", { ascending: true });
  if (error || !data) return [];
  return (
    data as Array<{
      key: string;
      value: unknown;
      description: string | null;
      updated_at: string;
    }>
  )
    .map((r) => ({
      key: r.key,
      value: isFlagValue(r.value) ? r.value : String(r.value),
      description: r.description,
      updated_at: r.updated_at,
    }));
}

export type SetFlagResult = { ok: true } | { ok: false; error: string };

export async function setFlag(
  key: FlagKey,
  value: FlagValue,
  actor_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<SetFlagResult> {
  if (!isFlagValue(value)) return { ok: false, error: "invalid_value" };
  const { error } = await client.from("platform_flags").upsert(
    {
      key,
      value: value as unknown,
      updated_at: new Date().toISOString(),
      updated_by: actor_id,
    },
    { onConflict: "key" }
  );
  if (error) return { ok: false, error: error.message };
  await client.from("audit_log").insert({
    actor_id,
    actor_type: "user",
    actor_role: "super_admin",
    organization_id: null,
    workspace_id: null,
    table_name: "platform_flags",
    record_id: null,
    action: "platform_flag_set",
    diff: { key, value },
  });
  return { ok: true };
}
