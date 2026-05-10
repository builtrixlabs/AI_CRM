import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "@/lib/webhooks/signing";

describe("signing.signPayload", () => {
  it("produces a sha256= prefixed 64-hex digest", () => {
    const sig = signPayload("topsecret", '{"foo":"bar"}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("differs across secrets for the same body", () => {
    const a = signPayload("secret-a", "body");
    const b = signPayload("secret-b", "body");
    expect(a).not.toBe(b);
  });

  it("throws on empty secret", () => {
    expect(() => signPayload("", "body")).toThrow(/empty/);
  });
});

describe("signing.verifySignature", () => {
  it("accepts the matching signature (with sha256= prefix)", () => {
    const sig = signPayload("topsecret", "body");
    expect(verifySignature("topsecret", "body", sig)).toBe(true);
  });

  it("accepts a bare-hex signature without prefix", () => {
    const sig = signPayload("topsecret", "body").replace(/^sha256=/, "");
    expect(verifySignature("topsecret", "body", sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signPayload("topsecret", "body");
    expect(verifySignature("topsecret", "tampered", sig)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const sig = signPayload("topsecret", "body");
    const tampered = sig.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(verifySignature("topsecret", "body", tampered)).toBe(false);
  });

  it("rejects mismatched secrets", () => {
    const sig = signPayload("secret-a", "body");
    expect(verifySignature("secret-b", "body", sig)).toBe(false);
  });

  it("rejects null header without throwing", () => {
    expect(verifySignature("topsecret", "body", null)).toBe(false);
  });

  it("rejects malformed hex without throwing", () => {
    // Length matches but not valid hex.
    expect(
      verifySignature("topsecret", "body", "sha256=" + "z".repeat(64))
    ).toBe(false);
  });

  it("rejects length-mismatched signatures (timing-safe-equal would throw)", () => {
    expect(verifySignature("topsecret", "body", "sha256=abc")).toBe(false);
  });
});
