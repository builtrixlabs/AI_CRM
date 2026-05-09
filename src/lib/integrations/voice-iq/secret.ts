// NOTE: This module is server-only by virtue of `getSupabaseAdmin()`
// throwing when imported in a browser bundle. No `server-only` import
// here — that pragma breaks vitest test runs that load the module
// transitively via routes.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSecret } from "@/lib/secrets/getSecret";

const KIND = "voice_iq_inbox_secret" as const;

export type VoiceIqSecretStatus = {
  is_set: boolean;
  last4: string | null;
  rotated_at: string | null;
  source: "org" | "platform" | "env" | "none";
};

/**
 * Get the active Voice IQ inbox secret for an org.
 *
 * Resolution order:
 *   1. org_integration_secrets[org_id, 'voice_iq_inbox_secret'].value
 *   2. platform_secrets[builtrix_event_inbox_secret].value (legacy fallback,
 *      so v0 deployments without per-org rotation keep working)
 *   3. process.env.BUILTRIX_EVENT_INBOX_SECRET
 *   4. null
 */
export async function getVoiceIqSecret(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<string | null> {
  const { data, error } = await client
    .from("org_integration_secrets")
    .select("value")
    .eq("organization_id", organization_id)
    .eq("kind", KIND)
    .maybeSingle();
  if (!error && data && typeof (data as { value?: string }).value === "string") {
    return (data as { value: string }).value;
  }
  return getSecret("builtrix_event_inbox_secret", client);
}

export async function getVoiceIqSecretStatus(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<VoiceIqSecretStatus> {
  const { data: orgRow, error: orgErr } = await client
    .from("org_integration_secrets")
    .select("last4, rotated_at")
    .eq("organization_id", organization_id)
    .eq("kind", KIND)
    .maybeSingle();
  if (!orgErr && orgRow) {
    const r = orgRow as { last4: string; rotated_at: string };
    return {
      is_set: true,
      last4: r.last4,
      rotated_at: r.rotated_at,
      source: "org",
    };
  }

  const platform = await getSecret("builtrix_event_inbox_secret", client);
  if (platform) {
    return {
      is_set: true,
      last4: platform.slice(-4),
      rotated_at: null,
      source: process.env.BUILTRIX_EVENT_INBOX_SECRET === platform ? "env" : "platform",
    };
  }

  return { is_set: false, last4: null, rotated_at: null, source: "none" };
}

export type RotateInput = {
  organization_id: string;
  actor_id: string;
};

export type RotateResult = {
  last4: string;
  rotated_at: string;
};

/**
 * Generate a new HMAC secret + write to org_integration_secrets.
 * Service-role only — caller MUST verify permission first.
 */
export async function rotateVoiceIqSecret(
  input: RotateInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<RotateResult> {
  const value = randomBytes(32).toString("hex"); // 64 hex chars
  const last4 = value.slice(-4);
  const now = new Date().toISOString();

  const { error } = await client.from("org_integration_secrets").upsert(
    {
      organization_id: input.organization_id,
      kind: KIND,
      value,
      last4,
      rotated_at: now,
      created_by: input.actor_id,
      updated_by: input.actor_id,
    },
    { onConflict: "organization_id,kind" }
  );
  if (error) throw error;

  await client.from("audit_log").insert({
    actor_id: input.actor_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: input.organization_id,
    workspace_id: null,
    table_name: "org_integration_secrets",
    record_id: input.organization_id,
    action: "voice_iq_secret_rotated",
    compiled_artifact: { last4, rotated_at: now },
  });

  return { last4, rotated_at: now };
}

/**
 * Soft rate-limit: refuse rotation if last rotation was within the last
 * 5 seconds. Demo lens — keeps fat-finger double-clicks from spamming
 * the audit log. Returns true when allowed.
 */
export async function canRotate(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<{ allowed: true } | { allowed: false; wait_seconds: number }> {
  const { data } = await client
    .from("org_integration_secrets")
    .select("rotated_at")
    .eq("organization_id", organization_id)
    .eq("kind", KIND)
    .maybeSingle();
  if (!data) return { allowed: true };
  const last = new Date((data as { rotated_at: string }).rotated_at).getTime();
  const elapsed_ms = Date.now() - last;
  if (elapsed_ms >= 5000) return { allowed: true };
  return { allowed: false, wait_seconds: Math.ceil((5000 - elapsed_ms) / 1000) };
}
