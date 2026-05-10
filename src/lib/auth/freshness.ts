/**
 * Pure, edge-safe MFA freshness primitives. Lives in its own module so
 * the edge middleware can import without pulling Supabase admin or
 * platform_flags (server-only Node) into the edge bundle.
 *
 * Re-exported from `./mfa` for back-compat with existing callers.
 */

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
