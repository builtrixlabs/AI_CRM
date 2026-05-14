/**
 * D-440 — per-org sister-product bearer-token helpers.
 *
 * Token lifecycle:
 *   issue → return plaintext ONCE → store SHA-256 hash + last4
 *   verify → SHA-256(token) → partial-index lookup → null on missing/revoked
 *   revoke → set revoked_at (soft revoke; hash kept so future presentations
 *            of the same token continue to fail-closed)
 *
 * Plaintext is `crypto.randomBytes(32).toString('base64url')` — 43 chars,
 * URL-safe, no padding. Hashed with SHA-256 stored as hex (64 chars).
 */

import * as crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SISTER_PRODUCT_KINDS = [
  "marketing_intelligence_hub",
] as const;
export type ProductKind = (typeof SISTER_PRODUCT_KINDS)[number];

export type IssuedToken = {
  id: string;
  token: string; // plaintext, returned to caller ONCE
  last4: string;
};

export type TokenSummary = {
  id: string;
  organization_id: string;
  product_kind: ProductKind;
  last4: string;
  created_at: string;
  created_by: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type VerifiedToken = {
  org_id: string;
  product_kind: ProductKind;
};

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateTokenPlaintext(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function issueToken(
  admin: SupabaseClient,
  args: {
    organization_id: string;
    product_kind: ProductKind;
    created_by: string;
  },
): Promise<IssuedToken> {
  const token = generateTokenPlaintext();
  const token_hash = hashToken(token);
  const last4 = token.slice(-4);
  const { data, error } = await admin
    .from("org_sister_product_tokens")
    .insert({
      organization_id: args.organization_id,
      product_kind: args.product_kind,
      token_hash,
      last4,
      created_by: args.created_by,
    })
    .select("id")
    .single();
  if (error) throw new Error(`db_error:${error.message}`);
  return { id: data.id as string, token, last4 };
}

export async function verifyToken(
  admin: SupabaseClient,
  token: string,
): Promise<VerifiedToken | null> {
  if (!token) return null;
  const token_hash = hashToken(token);
  const { data, error } = await admin
    .from("org_sister_product_tokens")
    .select("organization_id, product_kind, revoked_at")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return null;
  // Fire-and-forget last_used_at update — don't block the request on it.
  void admin
    .from("org_sister_product_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", token_hash);
  return {
    org_id: data.organization_id as string,
    product_kind: data.product_kind as ProductKind,
  };
}

export async function revokeToken(
  admin: SupabaseClient,
  args: { id: string; revoked_by: string },
): Promise<void> {
  const { error } = await admin
    .from("org_sister_product_tokens")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: args.revoked_by,
    })
    .eq("id", args.id);
  if (error) throw new Error(`db_error:${error.message}`);
}

export async function listTokens(
  admin: SupabaseClient,
  organization_id?: string,
): Promise<TokenSummary[]> {
  let q = admin
    .from("org_sister_product_tokens")
    .select(
      "id, organization_id, product_kind, last4, created_at, created_by, last_used_at, revoked_at, revoked_by",
    )
    .order("created_at", { ascending: false });
  if (organization_id) {
    q = q.eq("organization_id", organization_id);
  }
  const { data, error } = await q;
  if (error) throw new Error(`db_error:${error.message}`);
  return (data ?? []) as TokenSummary[];
}
