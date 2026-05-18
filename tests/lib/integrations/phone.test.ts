import { describe, expect, it } from "vitest";
import { normalizePhoneE164, phonesMatch } from "@/lib/integrations/phone";

describe("normalizePhoneE164", () => {
  it.each([
    ["+919812345678", "+919812345678"],
    ["+91 98123 45678", "+919812345678"],
    ["+91-98123-45678", "+919812345678"],
    ["(+91) 98123 45678", "+919812345678"],
    ["00919812345678", "+919812345678"],
    ["9812345678", "+919812345678"],
    ["09812345678", "+919812345678"],
    ["919812345678", "+919812345678"],
  ])("normalizes %s -> %s", (input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it.each([
    ["", null],
    [null, null],
    [undefined, null],
    ["abc", null],
    ["+abc", null],
    ["12345", null], // too short, ambiguous
    ["123", null],
    ["12345678901234567890", null], // > 15 digits
  ])("returns null for %s", (input, expected) => {
    expect(normalizePhoneE164(input as string | null | undefined)).toBe(expected);
  });

  it("respects BUILTRIX_DEFAULT_COUNTRY_CODE override", () => {
    const old = process.env.BUILTRIX_DEFAULT_COUNTRY_CODE;
    process.env.BUILTRIX_DEFAULT_COUNTRY_CODE = "1";
    try {
      // 10-digit US-style input
      expect(normalizePhoneE164("4155551234")).toBe("+14155551234");
    } finally {
      if (old === undefined) {
        delete process.env.BUILTRIX_DEFAULT_COUNTRY_CODE;
      } else {
        process.env.BUILTRIX_DEFAULT_COUNTRY_CODE = old;
      }
    }
  });
});

describe("phonesMatch", () => {
  it("returns true when both forms normalize identically", () => {
    expect(phonesMatch("9812345678", "+91 98123 45678")).toBe(true);
    expect(phonesMatch("00919812345678", "98123-45678")).toBe(true);
  });
  it("returns false when one side is unparseable", () => {
    expect(phonesMatch("9812345678", "abc")).toBe(false);
    expect(phonesMatch(null, "9812345678")).toBe(false);
  });
  it("returns false when numbers differ", () => {
    expect(phonesMatch("9812345678", "9812345679")).toBe(false);
  });
});
