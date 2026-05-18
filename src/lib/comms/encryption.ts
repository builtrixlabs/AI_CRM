/**
 * D-501 — AES-256-GCM helpers for at-rest credential storage.
 *
 * Used by per-org integration directives (D-433 Exotel, D-434 Resend,
 * D-435 MSG91, D-432 WhatsApp) to encrypt the credentials operators
 * paste into /admin/integrations/<channel> before writing to
 * org_<channel>_config tables.
 *
 * Mirrors the pattern in src/lib/webhooks/secret-crypto.ts but operates
 * on arbitrary JSON-serialisable objects (provider creds are
 * structured — SID + key + virtual number, not a single string).
 *
 * Key separation: a separate env var (`INTEGRATION_ENCRYPTION_KEY`) from
 * MFA / webhook secrets so a key compromise on one surface doesn't blast
 * both. Generate with `openssl rand -hex 32`.
 *
 * In production: required. Boot fails fast on missing/short key.
 * In dev/test (NODE_ENV !== "production"): falls back to a deterministic
 * zeros key so local + CI work without secrets.
 */

import * as crypto from "node:crypto";

export type EncryptedBlob = {
  iv: string;
  ciphertext: string;
  alg: "aes-256-gcm";
  key_version: number;
};

export const KEY_VERSION = 1;
const ENV_NAME = "INTEGRATION_ENCRYPTION_KEY";
const TEST_KEY_HEX = "0".repeat(64);

function getKey(): Buffer {
  const hex = process.env[ENV_NAME];
  if (!hex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${ENV_NAME} required in production`);
    }
    return Buffer.from(TEST_KEY_HEX, "hex");
  }
  if (hex.length !== 64) {
    throw new Error(`${ENV_NAME} must be 64 hex chars (32 bytes)`);
  }
  return Buffer.from(hex, "hex");
}

export function encryptJson(plain: unknown): EncryptedBlob {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.from(JSON.stringify(plain), "utf8");
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    ciphertext: Buffer.concat([enc, tag]).toString("hex"),
    alg: "aes-256-gcm",
    key_version: KEY_VERSION,
  };
}

export function decryptJson<T = unknown>(blob: EncryptedBlob): T {
  if (blob.alg !== "aes-256-gcm") {
    throw new Error(`unsupported_alg:${blob.alg}`);
  }
  const key = getKey();
  const iv = Buffer.from(blob.iv, "hex");
  const buf = Buffer.from(blob.ciphertext, "hex");
  if (buf.length < 17) {
    throw new Error("ciphertext_too_short");
  }
  const tag = buf.subarray(buf.length - 16);
  const enc = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(enc),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plain) as T;
}

/**
 * Display helper — masks a credential to show only its last 4 chars.
 * Used for "API key ····abcd" badges in admin UIs.
 */
export function maskLast4(s: string | null | undefined): string {
  if (!s) return "";
  return s.length <= 4 ? "*".repeat(s.length) : `····${s.slice(-4)}`;
}

/**
 * Returns true iff the encryption key env var is set (or we're in non-prod
 * where the zeros fallback kicks in). Used by admin UIs to disable the
 * "Save" button with a clear error when the operator hasn't provisioned
 * the key yet on a fresh preview branch.
 */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
