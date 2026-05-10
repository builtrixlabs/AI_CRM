/**
 * Client-safe MFA-gated route patterns. Lives in its own module so the
 * edge `decideRoute` can import without pulling Supabase admin / platform
 * flags (server-only) into the middleware bundle.
 *
 * Re-exported from `./mfa` for back-compat with existing callers (D-209
 * shipped `isSensitiveRoute` from `mfa.ts`).
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /^\/platform(\/|$)/,
  /^\/admin\/billing(\/|$)/,
  /^\/admin\/integrations(\/|$)/,
  /^\/admin\/webhooks(\/|$)/,
  /^\/settings\/users(\/|$)/,
  /^\/settings\/roles(\/|$)/,
];

export function isSensitiveRoute(pathname: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(pathname));
}
