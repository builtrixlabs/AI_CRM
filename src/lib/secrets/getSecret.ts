// NOTE: This module is server-only by virtue of `getSupabaseAdmin()`
// throwing when imported in a browser bundle. No `server-only` import
// here — that pragma breaks vitest test runs that load the module
// transitively via providers/routes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ENV_FALLBACK, type SecretKind } from "./types";

type Cached = { value: string; source: "db" | "env"; cached_at: number };

const CACHE_MS = 30_000; // 30s in-memory cache; rotations are rare.
const cache = new Map<SecretKind, Cached>();

/**
 * Resolve a secret value at runtime.
 *
 * Resolution order:
 *   1. `platform_secrets.value` for `kind` (set by super_admin via
 *      /platform/settings/secrets).
 *   2. `process.env[env_name]` (Vercel fallback for boot).
 *   3. `null` (caller decides — webhooks reject, gateway throws).
 *
 * Returns `null` when neither source is set.
 *
 * Server-only. The `import "server-only"` guard makes Next.js fail
 * the build if a Client Component imports this module — we never
 * want raw secrets in the browser bundle.
 */
export async function getSecret(
  kind: SecretKind,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(kind);
  if (hit && now - hit.cached_at < CACHE_MS) return hit.value;

  // Try DB first.
  const { data, error } = await client
    .from("platform_secrets")
    .select("value")
    .eq("kind", kind)
    .maybeSingle();
  if (!error && data && typeof (data as { value?: string }).value === "string") {
    const value = (data as { value: string }).value;
    cache.set(kind, { value, source: "db", cached_at: now });
    return value;
  }

  // Fallback to env.
  const envName = ENV_FALLBACK[kind];
  const envValue = process.env[envName];
  if (envValue && envValue.length > 0) {
    cache.set(kind, { value: envValue, source: "env", cached_at: now });
    return envValue;
  }

  return null;
}

/** Bust the in-memory cache for a single kind (called after rotation). */
export function invalidateSecretCache(kind: SecretKind): void {
  cache.delete(kind);
}

/** Test-only: clear the entire cache. */
export function _clearSecretCacheForTests(): void {
  cache.clear();
}
