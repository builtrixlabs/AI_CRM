/**
 * D-440 — Bearer-token auth middleware for /api/sister/* + /api/sister/events/*.
 *
 * D-441 (read API), D-442 (outbound events), D-443 (inbound events) all
 * call this helper to authenticate a sister-product request. The
 * resolved (org_id, product_kind) becomes the request context; cross-
 * tenant access is impossible because the token is bound to one org.
 *
 * Returns a discriminated union so callers can build the right HTTP
 * response (401 vs 403) without re-doing the Bearer parsing.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyToken, type VerifiedToken } from "@/lib/integrations/sister-products/token";

export type SisterProductAuthResult =
  | { ok: true; org_id: string; product_kind: VerifiedToken["product_kind"] }
  | { ok: false; status: 401; error: string };

// Match `Bearer <token>` case-insensitively. Headers normalize whitespace
// (the Fetch API trims trailing space), so we can't distinguish "missing
// scheme" from "Bearer with empty token" — both surface as a single
// `missing_bearer_token` error.
const BEARER_RE = /^Bearer\s+(\S+)/i;

export async function authenticateSisterProductRequest(
  req: Request,
): Promise<SisterProductAuthResult> {
  const auth = req.headers.get("authorization") ?? "";
  const m = BEARER_RE.exec(auth);
  if (!m) {
    return { ok: false, status: 401, error: "missing_bearer_token" };
  }
  const token = m[1];
  const result = await verifyToken(getSupabaseAdmin(), token);
  if (!result) {
    return { ok: false, status: 401, error: "invalid_or_revoked_token" };
  }
  return {
    ok: true,
    org_id: result.org_id,
    product_kind: result.product_kind,
  };
}

/**
 * Helper for routes that need to scope by `product_kind` — e.g., a
 * `/api/sister/v1/leads` route accessible to both `post_sales_crm` and
 * `lead_sources` tokens, but a `/api/sister/v1/deals` accessible only
 * to `post_sales_crm`.
 *
 * Returns true iff the token's product_kind is in the allowlist.
 */
export function tokenAllowedFor(
  product_kind: VerifiedToken["product_kind"],
  allowed: ReadonlyArray<VerifiedToken["product_kind"]>,
): boolean {
  return allowed.includes(product_kind);
}
