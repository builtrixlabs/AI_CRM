import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify an HMAC-SHA256 signature on a raw request body.
 *
 * Accepted header forms:
 *   - hex digest only:                    `<hex>`
 *   - prefixed (provider style):          `sha256=<hex>`
 *
 * Always computes the digest even on malformed input so timing
 * stays flat (D-010 / B2 — Constitution VII defense-in-depth).
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  headerValue: string | null | undefined,
  secret: string
): boolean {
  if (!secret) return false;

  const computed = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Compute always; constant-time compare last to keep timing flat.
  const provided =
    typeof headerValue === "string"
      ? stripPrefix(headerValue.trim())
      : "";

  if (provided.length === 0) return false;
  if (provided.length !== computed.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(computed, "hex")
    );
  } catch {
    // Buffer.from may throw on non-hex input — treat as mismatch.
    return false;
  }
}

function stripPrefix(value: string): string {
  const eq = value.indexOf("=");
  if (eq < 0) return value;
  // `sha256=<hex>` or `hmac=<hex>`
  return value.slice(eq + 1);
}
