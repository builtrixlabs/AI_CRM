/**
 * V3.x — column-level encryption for webhook_endpoints.secret.
 *
 * Mirrors the AES-256-GCM design used for profiles.mfa_secret (D-300),
 * but with a separate encryption key (`WEBHOOK_SECRET_ENCRYPTION_KEY`)
 * so a key compromise on one surface doesn't immediately blast both.
 *
 * Storage shape:
 *   { iv: hex(12B), ciphertext: hex(payload || tag), alg: "aes-256-gcm",
 *     key_version: int }
 *
 * Read path: getEndpointSecret(row) prefers `secret_payload` (encrypted)
 * and falls back to `secret` (legacy plaintext) until the operator
 * migrates rows.
 */

import * as crypto from "node:crypto";

export type WebhookSecretPayload = {
  iv: string;
  ciphertext: string;
  alg: "aes-256-gcm";
  key_version: number;
};

export const KEY_VERSION = 1;
const ENV_NAME = "WEBHOOK_SECRET_ENCRYPTION_KEY";
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

export function encryptWebhookSecret(plaintext: string): WebhookSecretPayload {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    ciphertext: Buffer.concat([enc, tag]).toString("hex"),
    alg: "aes-256-gcm",
    key_version: KEY_VERSION,
  };
}

export function decryptWebhookSecret(payload: WebhookSecretPayload): string {
  if (payload.alg !== "aes-256-gcm") {
    throw new Error(`unsupported_alg:${payload.alg}`);
  }
  const key = getKey();
  const iv = Buffer.from(payload.iv, "hex");
  const blob = Buffer.from(payload.ciphertext, "hex");
  const tag = blob.subarray(blob.length - 16);
  const enc = blob.subarray(0, blob.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * Read-side helper: prefers encrypted payload, falls back to legacy text.
 * Returns null when neither is set (signals a misconfigured endpoint row).
 */
export function getEndpointSecret(row: {
  secret: string | null;
  secret_payload: WebhookSecretPayload | null;
}): string | null {
  if (row.secret_payload) {
    try {
      return decryptWebhookSecret(row.secret_payload);
    } catch {
      // surface as "no usable secret" — caller's path will mark the
      // delivery dead with an error_message. Fail-closed.
      return null;
    }
  }
  return row.secret ?? null;
}
