import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/platform/flags";

export { isSensitiveRoute } from "./sensitive-routes";
export { defaultFreshnessMs, isMfaFresh } from "./freshness";

/**
 * Demo bypass: set MFA_DEMO_MODE=true (env) OR set platform flag
 * `demo_mode=true` to skip MFA gating during scripted demos.
 */
export async function isDemoBypassActive(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<boolean> {
  if (process.env.MFA_DEMO_MODE === "true") return true;
  return await getFlag<boolean>("demo_mode", false, client);
}

/**
 * Bump the user's MFA timestamp to "now". Used by /auth/mfa verify stub.
 * Real OTP / TOTP delivery lands V3 — for v2 this writes the stamp on
 * a click-confirm.
 */
export async function markMfaVerified(
  user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<{ ok: true; verified_at: string } | { ok: false; error: string }> {
  const verified_at = new Date().toISOString();
  const { error } = await client
    .from("profiles")
    .update({ mfa_verified_at: verified_at })
    .eq("id", user_id);
  if (error) return { ok: false, error: error.message };
  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "self",
    organization_id: null,
    workspace_id: null,
    table_name: "profiles",
    record_id: user_id,
    action: "mfa_verified",
    diff: { verified_at },
  });
  return { ok: true, verified_at };
}
