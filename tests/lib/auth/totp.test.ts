import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Secret, TOTP } from "otpauth";
import {
  generateSecret,
  encryptSecret,
  decryptSecret,
  verifyCode,
  buildOtpauthUrl,
  KEY_VERSION,
} from "@/lib/auth/totp";

describe("totp.generateSecret", () => {
  it("returns a base32-encoded secret of standard length", () => {
    const { secret_b32 } = generateSecret();
    expect(secret_b32).toMatch(/^[A-Z2-7]+$/);
    expect(secret_b32.length).toBeGreaterThanOrEqual(32);
  });

  it("returns a builder that produces a valid otpauth URL", () => {
    const { otpauth_url } = generateSecret();
    const url = otpauth_url("user@example.com", "Builtrix CRM");
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("issuer=Builtrix");
    expect(url).toContain("user");
  });

  it("produces a different secret each call", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a.secret_b32).not.toBe(b.secret_b32);
  });
});

describe("totp.encryptSecret + decryptSecret", () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origKey = process.env.MFA_ENCRYPTION_KEY;

  afterEach(() => {
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = origKey;
  });

  it("roundtrip preserves the original secret bytes", () => {
    const { secret_b32 } = generateSecret();
    const payload = encryptSecret(secret_b32);
    expect(decryptSecret(payload)).toBe(secret_b32);
  });

  it("payload shape: iv (12 bytes hex) + ciphertext + alg + key_version", () => {
    const { secret_b32 } = generateSecret();
    const p = encryptSecret(secret_b32);
    expect(p.iv).toMatch(/^[0-9a-f]{24}$/);
    expect(p.ciphertext).toMatch(/^[0-9a-f]+$/);
    expect(p.alg).toBe("aes-256-gcm");
    expect(p.key_version).toBe(KEY_VERSION);
  });

  it("each encrypt produces a unique IV and ciphertext (no nonce reuse)", () => {
    const { secret_b32 } = generateSecret();
    const p1 = encryptSecret(secret_b32);
    const p2 = encryptSecret(secret_b32);
    expect(p1.iv).not.toBe(p2.iv);
    expect(p1.ciphertext).not.toBe(p2.ciphertext);
  });

  it("tampered ciphertext throws on decrypt (auth tag mismatch)", () => {
    const { secret_b32 } = generateSecret();
    const p = encryptSecret(secret_b32);
    // Flip the last hex nibble deterministically so the tampered char
    // is always different from the original (avoids the flake where
    // the random byte happens to already end in '0').
    const lastChar = p.ciphertext.slice(-1);
    const flipped = lastChar === "0" ? "1" : "0";
    const tampered = {
      ...p,
      ciphertext: p.ciphertext.slice(0, -1) + flipped,
    };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("decrypt with mismatched IV throws", () => {
    const { secret_b32 } = generateSecret();
    const p = encryptSecret(secret_b32);
    const wrongIv = { ...p, iv: "0".repeat(24) };
    expect(() => decryptSecret(wrongIv)).toThrow();
  });

  it("requires MFA_ENCRYPTION_KEY in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(() => encryptSecret("AAAA")).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it("rejects MFA_ENCRYPTION_KEY of wrong length", () => {
    process.env.MFA_ENCRYPTION_KEY = "abcd";
    expect(() => encryptSecret("AAAA")).toThrow(/64 hex/);
  });

  it("uses the configured key when provided (different keys yield different ciphertext for same input)", () => {
    process.env.MFA_ENCRYPTION_KEY = "1".repeat(64);
    const p1 = encryptSecret("CONSTANT_SECRET");
    process.env.MFA_ENCRYPTION_KEY = "2".repeat(64);
    const p2 = encryptSecret("CONSTANT_SECRET");
    expect(p1.ciphertext).not.toBe(p2.ciphertext);
  });
});

describe("totp.verifyCode", () => {
  function makeTotp(secret_b32: string): TOTP {
    return new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret_b32),
    });
  }

  it("accepts the current TOTP step", () => {
    const { secret_b32 } = generateSecret();
    const now = 1_700_000_000_000;
    const code = makeTotp(secret_b32).generate({ timestamp: now });
    expect(verifyCode(secret_b32, code, now)).toBe(true);
  });

  it("accepts ±1 step (the ±30s skew window)", () => {
    const { secret_b32 } = generateSecret();
    const now = 1_700_000_000_000;
    const codePrev = makeTotp(secret_b32).generate({ timestamp: now - 30_000 });
    const codeNext = makeTotp(secret_b32).generate({ timestamp: now + 30_000 });
    expect(verifyCode(secret_b32, codePrev, now)).toBe(true);
    expect(verifyCode(secret_b32, codeNext, now)).toBe(true);
  });

  it("rejects codes outside the ±1 step window (≥2 steps away)", () => {
    const { secret_b32 } = generateSecret();
    const now = 1_700_000_000_000;
    const codeFar = makeTotp(secret_b32).generate({
      timestamp: now + 120_000,
    });
    expect(verifyCode(secret_b32, codeFar, now)).toBe(false);
  });

  it("rejects malformed codes without throwing", () => {
    const { secret_b32 } = generateSecret();
    expect(verifyCode(secret_b32, "abcdef")).toBe(false);
    expect(verifyCode(secret_b32, "12345")).toBe(false);
    expect(verifyCode(secret_b32, "1234567")).toBe(false);
    expect(verifyCode(secret_b32, "")).toBe(false);
    expect(verifyCode(secret_b32, "12 345")).toBe(false);
  });

  it("rejects a code generated for a different secret", () => {
    const a = generateSecret();
    const b = generateSecret();
    const now = 1_700_000_000_000;
    const codeForA = makeTotp(a.secret_b32).generate({ timestamp: now });
    expect(verifyCode(b.secret_b32, codeForA, now)).toBe(false);
  });
});

describe("totp.buildOtpauthUrl", () => {
  it("produces a URL identical to generateSecret().otpauth_url for the same inputs", () => {
    const { secret_b32, otpauth_url } = generateSecret();
    const fromGen = otpauth_url("user@example.com", "Builtrix CRM");
    const fromBuild = buildOtpauthUrl(secret_b32, "user@example.com", "Builtrix CRM");
    expect(fromBuild).toBe(fromGen);
  });

  it("encodes label + issuer correctly", () => {
    const { secret_b32 } = generateSecret();
    const url = buildOtpauthUrl(secret_b32, "u@x.io", "Acme");
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("issuer=Acme");
    expect(url).toContain("u%40x.io");
  });
});
