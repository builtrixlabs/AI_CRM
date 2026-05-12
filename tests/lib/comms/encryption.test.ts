import { describe, expect, it } from "vitest";
import {
  encryptJson,
  decryptJson,
  maskLast4,
  isEncryptionConfigured,
  type EncryptedBlob,
} from "@/lib/comms/encryption";

describe("encryption", () => {
  it("round-trips a JSON object through encrypt/decrypt", () => {
    const plain = {
      sid: "EXOTEL-SID-12345",
      api_key: "exotel-key-abcdef",
      virtual_number: "+91-99999-00000",
    };
    const blob = encryptJson(plain);
    expect(blob.alg).toBe("aes-256-gcm");
    expect(blob.iv).toMatch(/^[0-9a-f]+$/);
    expect(blob.ciphertext).toMatch(/^[0-9a-f]+$/);
    expect(blob.key_version).toBe(1);
    const back = decryptJson(blob);
    expect(back).toEqual(plain);
  });

  it("produces a unique IV per encryption call", () => {
    const a = encryptJson({ x: 1 });
    const b = encryptJson({ x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a blob with the wrong algorithm", () => {
    const bad: EncryptedBlob = {
      iv: "00".repeat(12),
      ciphertext: "00".repeat(32),
      alg: "des-cbc" as unknown as "aes-256-gcm",
      key_version: 1,
    };
    expect(() => decryptJson(bad)).toThrow(/unsupported_alg/);
  });

  it("rejects a truncated ciphertext", () => {
    const bad: EncryptedBlob = {
      iv: "00".repeat(12),
      ciphertext: "ab",
      alg: "aes-256-gcm",
      key_version: 1,
    };
    expect(() => decryptJson(bad)).toThrow(/ciphertext_too_short/);
  });

  it("maskLast4 redacts secrets to ····tail4", () => {
    expect(maskLast4("EXOTEL-SID-abcd1234")).toBe("····1234");
    expect(maskLast4("abcd")).toBe("****");
    expect(maskLast4("")).toBe("");
    expect(maskLast4(null)).toBe("");
    expect(maskLast4(undefined)).toBe("");
  });

  it("isEncryptionConfigured returns true with the dev fallback key", () => {
    // In NODE_ENV !== "production", missing env falls back to zeros key —
    // tests should always see "configured".
    expect(isEncryptionConfigured()).toBe(true);
  });
});
