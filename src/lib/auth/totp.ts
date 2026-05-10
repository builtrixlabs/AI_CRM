import * as crypto from "node:crypto";
import { Secret, TOTP } from "otpauth";

export type MfaSecretPayload = {
  iv: string;
  ciphertext: string;
  alg: "aes-256-gcm";
  key_version: number;
};

export const KEY_VERSION = 1;
const TEST_KEY_HEX = "0".repeat(64);

export type GenerateSecretResult = {
  secret_b32: string;
  otpauth_url: (label: string, issuer: string) => string;
};

export function generateSecret(): GenerateSecretResult {
  const secret = new Secret({ size: 20 });
  return {
    secret_b32: secret.base32,
    otpauth_url: (label, issuer) =>
      new TOTP({
        issuer,
        label,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      }).toString(),
  };
}

function getKey(): Buffer {
  const hex = process.env.MFA_ENCRYPTION_KEY;
  if (!hex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MFA_ENCRYPTION_KEY is required in production");
    }
    return Buffer.from(TEST_KEY_HEX, "hex");
  }
  if (hex.length !== 64) {
    throw new Error("MFA_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext_b32: string): MfaSecretPayload {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext_b32, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    ciphertext: Buffer.concat([enc, tag]).toString("hex"),
    alg: "aes-256-gcm",
    key_version: KEY_VERSION,
  };
}

export function decryptSecret(payload: MfaSecretPayload): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, "hex");
  const blob = Buffer.from(payload.ciphertext, "hex");
  const tag = blob.subarray(blob.length - 16);
  const enc = blob.subarray(0, blob.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8"
  );
}

export function verifyCode(
  secret_b32: string,
  code: string,
  now_ms: number = Date.now()
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const totp = new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret_b32),
  });
  const delta = totp.validate({ token: code, timestamp: now_ms, window: 1 });
  return delta !== null;
}

/**
 * Build an `otpauth://totp/...` URL for a stored base32 secret. Used by
 * the setup page when re-rendering an in-progress enrollment without
 * regenerating the secret.
 */
export function buildOtpauthUrl(
  secret_b32: string,
  label: string,
  issuer: string
): string {
  return new TOTP({
    issuer,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret_b32),
  }).toString();
}
