import * as crypto from "node:crypto";

/**
 * D-311 — outbound webhook signing. Mirrors D-010's WhatsApp inbound
 * pattern (HMAC-SHA256, hex-encoded, prefixed with `sha256=`). Same
 * primitive on both sides so any customer who's already integrated
 * with our inbound spec can use the same verifier.
 *
 * Header name (caller's responsibility): `x-builtrix-signature`.
 */

const PREFIX = "sha256=";

export function signPayload(secret: string, body: string): string {
  if (!secret) throw new Error("webhook signing secret is empty");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `${PREFIX}${mac}`;
}

/**
 * Timing-safe verifier. Strips the `sha256=` prefix on the supplied
 * header (mirroring how D-010 accepts both `sha256=...` and bare hex).
 * Returns false on length mismatch — `timingSafeEqual` would throw.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string | null
): boolean {
  if (!header) return false;
  const supplied = header.startsWith(PREFIX) ? header.slice(PREFIX.length) : header;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  if (supplied.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(supplied, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}
