import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWhatsAppSignature } from "@/lib/webhooks/whatsapp/signature";

const SECRET = "test-secret-do-not-use-in-prod";

function digest(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

describe("verifyWhatsAppSignature", () => {
  it("accepts a matching hex digest", () => {
    const body = '{"wa_message_id":"abc","body":"hi"}';
    expect(verifyWhatsAppSignature(body, digest(body), SECRET)).toBe(true);
  });

  it("accepts a `sha256=<hex>` prefixed header", () => {
    const body = '{"wa_message_id":"abc"}';
    const sig = `sha256=${digest(body)}`;
    expect(verifyWhatsAppSignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects a mismatched signature", () => {
    const body = '{"wa_message_id":"abc"}';
    const wrong = digest("different body");
    expect(verifyWhatsAppSignature(body, wrong, SECRET)).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(verifyWhatsAppSignature("body", "", SECRET)).toBe(false);
    expect(verifyWhatsAppSignature("body", null, SECRET)).toBe(false);
    expect(verifyWhatsAppSignature("body", undefined, SECRET)).toBe(false);
  });

  it("rejects an empty secret", () => {
    expect(verifyWhatsAppSignature("body", "abc", "")).toBe(false);
  });

  it("rejects malformed hex (non-hex chars)", () => {
    const body = "body";
    const ok = digest(body);
    const bogus = "Z".repeat(ok.length); // same length, invalid hex
    expect(verifyWhatsAppSignature(body, bogus, SECRET)).toBe(false);
  });

  it("rejects a signature of wrong length even if same prefix", () => {
    const body = "body";
    const truncated = digest(body).slice(0, 32);
    expect(verifyWhatsAppSignature(body, truncated, SECRET)).toBe(false);
  });

  it("strips a `hmac=<hex>` prefix the same way as `sha256=`", () => {
    const body = "body";
    const sig = `hmac=${digest(body)}`;
    expect(verifyWhatsAppSignature(body, sig, SECRET)).toBe(true);
  });
});
