import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/platform/flags";

const SENSITIVE_PATTERNS: RegExp[] = [
  /^\/platform(\/|$)/,
  /^\/admin\/billing(\/|$)/,
  /^\/admin\/integrations(\/|$)/,
  /^\/admin\/webhooks(\/|$)/,
  /^\/settings\/users(\/|$)/,
  /^\/settings\/roles(\/|$)/,
];

export function defaultFreshnessMs(): number {
  const fromEnv = Number(process.env.MFA_FRESHNESS_HOURS);
  const hours = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 8;
  return hours * 60 * 60 * 1000;
}

export function isMfaFresh(
  verified_at: string | null | undefined,
  now: number = Date.now(),
  freshness_ms: number = defaultFreshnessMs()
): boolean {
  if (!verified_at) return false;
  const t = new Date(verified_at).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < freshness_ms;
}

export function isSensitiveRoute(pathname: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(pathname));
}

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
