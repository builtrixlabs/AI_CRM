import { describe, expect, it } from "vitest";
import {
  encryptWebhookSecret,
  decryptWebhookSecret,
  getEndpointSecret,
  type WebhookSecretPayload,
} from "@/lib/webhooks/secret-crypto";

describe("encryptWebhookSecret / decryptWebhookSecret", () => {
  it("round-trips a secret losslessly", () => {
    const plaintext = "whsec_" + "x".repeat(40);
    const payload = encryptWebhookSecret(plaintext);
    expect(payload.alg).toBe("aes-256-gcm");
    expect(payload.key_version).toBe(1);
    expect(payload.iv).toMatch(/^[0-9a-f]{24}$/);
    expect(payload.ciphertext).toMatch(/^[0-9a-f]+$/);
    expect(decryptWebhookSecret(payload)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptWebhookSecret("topsecret-1234");
    const b = encryptWebhookSecret("topsecret-1234");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptWebhookSecret(a)).toBe("topsecret-1234");
    expect(decryptWebhookSecret(b)).toBe("topsecret-1234");
  });

  it("throws on tag mismatch (tampered ciphertext)", () => {
    const payload = encryptWebhookSecret("hello-world-secret");
    // Flip a byte in the middle of ciphertext (not the tag, that fails too)
    const tampered: WebhookSecretPayload = {
      ...payload,
      ciphertext: payload.ciphertext.slice(0, 4) +
        (payload.ciphertext[4] === "0" ? "1" : "0") +
        payload.ciphertext.slice(5),
    };
    expect(() => decryptWebhookSecret(tampered)).toThrow();
  });

  it("rejects unsupported alg in payload", () => {
    expect(() =>
      decryptWebhookSecret({
        iv: "00".repeat(12),
        ciphertext: "deadbeef",
        // @ts-expect-error force bad input
        alg: "rot13",
        key_version: 1,
      }),
    ).toThrow(/unsupported_alg/);
  });
});

describe("getEndpointSecret", () => {
  it("prefers encrypted payload when present", () => {
    const payload = encryptWebhookSecret("encrypted-value");
    const v = getEndpointSecret({ secret: "legacy-plaintext", secret_payload: payload });
    expect(v).toBe("encrypted-value");
  });

  it("falls back to legacy plaintext when payload absent", () => {
    expect(getEndpointSecret({ secret: "legacy-only", secret_payload: null })).toBe("legacy-only");
  });

  it("returns null when both are missing", () => {
    expect(getEndpointSecret({ secret: null, secret_payload: null })).toBeNull();
  });

  it("returns null on unrecoverable payload (fail-closed, not a throw)", () => {
    const bad: WebhookSecretPayload = {
      iv: "00".repeat(12),
      ciphertext: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      alg: "aes-256-gcm",
      key_version: 1,
    };
    expect(getEndpointSecret({ secret: "should-not-fall-back", secret_payload: bad })).toBeNull();
  });
});
