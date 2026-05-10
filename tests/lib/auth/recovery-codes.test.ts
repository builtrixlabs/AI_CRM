import { describe, expect, it, vi } from "vitest";
import {
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_PATTERN,
  generateCodes,
  hashCode,
  verifyCodeHash,
  hashCodes,
  markCodeUsed,
  type RecoveryCodeEntry,
} from "@/lib/auth/recovery-codes";

const USER_ID = "11111111-2222-4333-8444-555555555555";

describe("recovery-codes.generateCodes", () => {
  it("returns the requested number of codes", () => {
    expect(generateCodes(10)).toHaveLength(10);
    expect(generateCodes(5)).toHaveLength(5);
    expect(generateCodes()).toHaveLength(RECOVERY_CODE_COUNT);
  });

  it("returns unique codes", () => {
    const codes = generateCodes(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("each code matches the documented pattern XXXX-XXXX", () => {
    for (const c of generateCodes(20)) {
      expect(c).toMatch(RECOVERY_CODE_PATTERN);
    }
  });

  it("excludes visually ambiguous chars (0/O/I/1)", () => {
    const codes = generateCodes(50).join("");
    expect(codes).not.toMatch(/[01OI]/);
  });
});

describe("recovery-codes.hashCode + verifyCodeHash", () => {
  it("roundtrip — verify returns true for the same code", async () => {
    const code = generateCodes(1)[0];
    const hash = await hashCode(code);
    expect(await verifyCodeHash(code, hash)).toBe(true);
  });

  it("verify returns false for a different code", async () => {
    const [a, b] = generateCodes(2);
    const hashA = await hashCode(a);
    expect(await verifyCodeHash(b, hashA)).toBe(false);
  });

  it("verify is case-insensitive (normalizes to upper)", async () => {
    const code = generateCodes(1)[0];
    const hash = await hashCode(code);
    expect(await verifyCodeHash(code.toLowerCase(), hash)).toBe(true);
  });

  it("hash is deterministic length but salted (different invocations differ)", async () => {
    const code = generateCodes(1)[0];
    const h1 = await hashCode(code);
    const h2 = await hashCode(code);
    expect(h1).not.toBe(h2);
    expect(await verifyCodeHash(code, h1)).toBe(true);
    expect(await verifyCodeHash(code, h2)).toBe(true);
  });
});

describe("recovery-codes.hashCodes", () => {
  it("returns an array of unused entries with hashed codes", async () => {
    const codes = generateCodes(3);
    const entries = await hashCodes(codes);
    expect(entries).toHaveLength(3);
    for (let i = 0; i < entries.length; i++) {
      expect(entries[i].used_at).toBeNull();
      expect(entries[i].used_from_ip).toBeNull();
      expect(await verifyCodeHash(codes[i], entries[i].hash)).toBe(true);
    }
  });
});

function makeClient(opts: {
  codes: RecoveryCodeEntry[] | null;
  updateError?: { message: string };
}) {
  const updates: { table: string; payload: unknown }[] = [];
  const profilesChain: Record<string, unknown> = {
    select: vi.fn(() => profilesChain),
    eq: vi.fn(() => profilesChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: opts.codes === null ? null : { mfa_recovery_codes: opts.codes },
        error: null,
      })
    ),
    update: vi.fn((payload: unknown) => {
      updates.push({ table: "profiles", payload });
      return {
        eq: vi.fn(() => Promise.resolve({ error: opts.updateError ?? null })),
      };
    }),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "profiles") return profilesChain;
      throw new Error(`Unexpected ${table}`);
    }),
  };
  return { client, updates, profilesChain };
}

describe("recovery-codes.markCodeUsed", () => {
  it("rejects malformed code shapes without DB roundtrip", async () => {
    const { client, profilesChain } = makeClient({ codes: [] });
    const r = await markCodeUsed(USER_ID, "not-a-code", null, client as never);
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(profilesChain.select).not.toHaveBeenCalled();
  });

  it("first use of a valid code succeeds and stamps used_at + ip", async () => {
    const codes = generateCodes(3);
    const entries = await hashCodes(codes);
    const { client, updates } = makeClient({ codes: entries });
    const r = await markCodeUsed(USER_ID, codes[1], "1.2.3.4", client as never);
    expect(r).toEqual({ ok: true, index: 1 });
    expect(updates).toHaveLength(1);
    const next = (updates[0].payload as { mfa_recovery_codes: RecoveryCodeEntry[] })
      .mfa_recovery_codes;
    expect(next[0].used_at).toBeNull();
    expect(next[1].used_at).not.toBeNull();
    expect(next[1].used_from_ip).toBe("1.2.3.4");
    expect(next[2].used_at).toBeNull();
  });

  it("reusing the same code returns already_used (and does NOT mutate)", async () => {
    const codes = generateCodes(2);
    const entries = await hashCodes(codes);
    entries[0] = {
      ...entries[0],
      used_at: "2026-05-09T12:00:00.000Z",
      used_from_ip: "1.1.1.1",
    };
    const { client, updates } = makeClient({ codes: entries });
    const r = await markCodeUsed(USER_ID, codes[0], "9.9.9.9", client as never);
    expect(r).toEqual({ ok: false, reason: "already_used" });
    expect(updates).toHaveLength(0);
  });

  it("non-matching valid-shape code returns invalid", async () => {
    const codes = generateCodes(2);
    const entries = await hashCodes(codes);
    const { client } = makeClient({ codes: entries });
    const r = await markCodeUsed(
      USER_ID,
      "ZZZZ-ZZZZ",
      null,
      client as never
    );
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("missing profile row returns invalid", async () => {
    const { client } = makeClient({ codes: null });
    const r = await markCodeUsed(
      USER_ID,
      "ABCD-EFGH",
      null,
      client as never
    );
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("DB update error returns invalid", async () => {
    const codes = generateCodes(1);
    const entries = await hashCodes(codes);
    const { client } = makeClient({
      codes: entries,
      updateError: { message: "boom" },
    });
    const r = await markCodeUsed(USER_ID, codes[0], null, client as never);
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });
});
