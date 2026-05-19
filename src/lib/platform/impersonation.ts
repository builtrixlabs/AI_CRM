/**
 * D-606 — Super-admin impersonation cookie + log.
 *
 * Architecture:
 *   - A signed cookie (`impersonation_session`) carries the active
 *     impersonation context. The cookie is the source of truth for
 *     `getCurrentUser()`'s overlay.
 *   - Signature is HMAC-SHA256 over the payload string using
 *     INTEGRATION_ENCRYPTION_KEY — the same secret D-432/-433/-434/-435
 *     already require, so no new env var.
 *   - On `startImpersonation`, a `super_admin_impersonation_log` row is
 *     inserted; on `endImpersonation`, its `ended_at` is set.
 *   - On verify, the caller's live `auth.getUser().id` must match the
 *     cookie's `impersonator_id` (catches replay from another session).
 *
 * Runtime portability: HMAC uses **Web Crypto** (`crypto.subtle`) so the
 * cookie verify path is safe to load from the Next.js middleware (edge
 * runtime) — `getCurrentUser` reaches this file transitively. `node:crypto`
 * is NOT supported in the edge runtime and would surface as
 * "The Edge Function _middleware is referencing unsupported modules:
 * __vc__ns__/0/index.js: node:crypto" at deploy time.
 */

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Impersonation } from "@/lib/auth/types";

export const IMPERSONATION_COOKIE = "impersonation_session";
export const IMPERSONATION_WINDOW_MS = 30 * 60 * 1000; // 30 min fixed window.

const SECRET_ENV = "INTEGRATION_ENCRYPTION_KEY";
const TEST_KEY_HEX = "0".repeat(64);

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function getSigningSecret(): Uint8Array {
  const hex = process.env[SECRET_ENV];
  if (!hex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${SECRET_ENV} required in production`);
    }
    return hexToBytes(TEST_KEY_HEX);
  }
  if (hex.length !== 64) {
    throw new Error(`${SECRET_ENV} must be 64 hex chars (32 bytes)`);
  }
  return hexToBytes(hex);
}

async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmacSign(message: string): Promise<Uint8Array> {
  const key = await importHmacKey(getSigningSecret());
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(sig);
}

async function hmacVerify(
  message: string,
  signatureBytes: Uint8Array,
): Promise<boolean> {
  const key = await importHmacKey(getSigningSecret());
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(message),
  );
}

type CookiePayload = {
  i: string; // impersonator_id (super admin's user id)
  o: string; // target organization_id
  s: string; // started_at ISO
  e: string; // expires_at ISO
};

function b64urlEncode(buf: Uint8Array): string {
  // Browser-compatible base64 encode (avoid Node's Buffer to keep edge-safe).
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  const std = typeof btoa !== "undefined"
    ? btoa(s)
    : Buffer.from(buf).toString("base64");
  return std.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = "===".slice(0, (4 - (s.length % 4)) % 4);
  const std = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob !== "undefined") {
    const bin = atob(std);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(std, "base64"));
}

export async function signImpersonationCookie(args: {
  impersonator_id: string;
  organization_id: string;
  started_at: Date;
  expires_at: Date;
}): Promise<string> {
  const payload: CookiePayload = {
    i: args.impersonator_id,
    o: args.organization_id,
    s: args.started_at.toISOString(),
    e: args.expires_at.toISOString(),
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sigBytes = await hmacSign(body);
  return `${body}.${b64urlEncode(sigBytes)}`;
}

export type VerifyResult =
  | { ok: true; payload: CookiePayload }
  | { ok: false; reason: "bad_format" | "bad_signature" | "expired" };

export async function verifyImpersonationCookie(
  value: string,
): Promise<VerifyResult> {
  const parts = value.split(".");
  if (parts.length !== 2) return { ok: false, reason: "bad_format" };
  const [body, sig] = parts;
  let sigBytes: Uint8Array;
  try {
    sigBytes = b64urlDecode(sig);
  } catch {
    return { ok: false, reason: "bad_format" };
  }
  const ok = await hmacVerify(body, sigBytes);
  if (!ok) return { ok: false, reason: "bad_signature" };
  let payload: CookiePayload;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(body)),
    ) as CookiePayload;
  } catch {
    return { ok: false, reason: "bad_format" };
  }
  if (!payload.i || !payload.o || !payload.s || !payload.e) {
    return { ok: false, reason: "bad_format" };
  }
  if (Date.parse(payload.e) <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

/**
 * Read the active impersonation context for this request — null if no
 * cookie, bad signature, or expired. Does NOT cross-check the auth user
 * (that happens in getCurrentUser's overlay, where the auth user is
 * already fetched).
 */
export async function getImpersonationCookiePayload(): Promise<CookiePayload | null> {
  let jar;
  try {
    jar = await cookies();
  } catch {
    // Outside a request context (e.g. unit tests that exercise lib code
    // without mocking next/headers) cookies() throws — treat as "no
    // impersonation". The overlay short-circuits to the super admin's
    // normal context.
    return null;
  }
  const c = jar.get(IMPERSONATION_COOKIE);
  if (!c) return null;
  const v = await verifyImpersonationCookie(c.value);
  return v.ok ? v.payload : null;
}

/**
 * Start an impersonation session: insert log row + set cookie.
 * Caller is responsible for the `platform:manage` permission check.
 */
export async function startImpersonation(args: {
  super_admin_id: string;
  organization_id: string;
  reason: string;
  now?: Date;
  client?: SupabaseClient;
}): Promise<
  | { ok: true; session_id: string; impersonation: Impersonation }
  | { ok: false; reason: "validation" | "not_found" | string }
> {
  if (!args.reason || args.reason.trim().length < 10) {
    return { ok: false, reason: "validation" };
  }
  const client = args.client ?? getSupabaseAdmin();

  const { data: org } = await client
    .from("organizations")
    .select("id, name")
    .eq("id", args.organization_id)
    .maybeSingle();
  if (!org) return { ok: false, reason: "not_found" };

  const now = args.now ?? new Date();
  const expires = new Date(now.getTime() + IMPERSONATION_WINDOW_MS);

  const { data: log, error } = await client
    .from("super_admin_impersonation_log")
    .insert({
      super_admin_id: args.super_admin_id,
      organization_id: args.organization_id,
      started_at: now.toISOString(),
      reason: args.reason.trim(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.message };

  const session_id = (log as { id: string }).id;
  const cookieValue = await signImpersonationCookie({
    impersonator_id: args.super_admin_id,
    organization_id: args.organization_id,
    started_at: now,
    expires_at: expires,
  });

  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });

  return {
    ok: true,
    session_id,
    impersonation: {
      impersonator_id: args.super_admin_id,
      organization_id: args.organization_id,
      organization_name:
        (org as { id: string; name: string } | null)?.name ?? null,
      started_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
  };
}

/**
 * End the active impersonation: clear cookie + close the most recent
 * open log row for (super_admin_id, organization_id).
 */
export async function endImpersonation(args: {
  super_admin_id: string;
  organization_id: string;
  client?: SupabaseClient;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = args.client ?? getSupabaseAdmin();
  const { error } = await client
    .from("super_admin_impersonation_log")
    .update({ ended_at: new Date().toISOString() })
    .eq("super_admin_id", args.super_admin_id)
    .eq("organization_id", args.organization_id)
    .is("ended_at", null);
  if (error) return { ok: false, reason: error.message };

  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE);
  return { ok: true };
}

export type ImpersonationLogRow = {
  id: string;
  super_admin_id: string;
  organization_id: string;
  started_at: string;
  ended_at: string | null;
  reason: string;
};

/** List most-recent impersonation sessions across all super admins. */
export async function listImpersonationLog(args: {
  limit?: number;
  client?: SupabaseClient;
}): Promise<ImpersonationLogRow[]> {
  const client = args.client ?? getSupabaseAdmin();
  const { data } = await client
    .from("super_admin_impersonation_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(args.limit ?? 50);
  return (data ?? []) as ImpersonationLogRow[];
}
