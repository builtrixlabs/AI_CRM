import { describe, expect, it, vi } from "vitest";

// Avoid pulling next/headers from getCurrentUser indirectly.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_WINDOW_MS,
  signImpersonationCookie,
  verifyImpersonationCookie,
} from "@/lib/platform/impersonation";

const SUPER_ID = "11111111-2222-4333-8444-555555555555";
const ORG_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

describe("impersonation cookie sign/verify", () => {
  it("round-trips a payload through sign/verify", async () => {
    const now = new Date("2026-05-19T12:00:00.000Z");
    const exp = new Date(now.getTime() + IMPERSONATION_WINDOW_MS);
    const cookie = await signImpersonationCookie({
      impersonator_id: SUPER_ID,
      organization_id: ORG_ID,
      started_at: now,
      expires_at: exp,
    });
    expect(cookie).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const v = await verifyImpersonationCookie(cookie);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.i).toBe(SUPER_ID);
      expect(v.payload.o).toBe(ORG_ID);
      expect(v.payload.s).toBe(now.toISOString());
      expect(v.payload.e).toBe(exp.toISOString());
    }
  });

  it("rejects a tampered signature (bad_signature)", async () => {
    const cookie = await signImpersonationCookie({
      impersonator_id: SUPER_ID,
      organization_id: ORG_ID,
      started_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
    });
    const [body] = cookie.split(".");
    const tampered = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const v = await verifyImpersonationCookie(tampered);
    expect(v).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload (signature no longer matches)", async () => {
    const cookie = await signImpersonationCookie({
      impersonator_id: SUPER_ID,
      organization_id: ORG_ID,
      started_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
    });
    const [, sig] = cookie.split(".");
    const altBody = Buffer.from(
      JSON.stringify({ i: SUPER_ID, o: "00000000-0000-4000-8000-000000000099", s: "x", e: "y" }),
      "utf8",
    )
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const v = await verifyImpersonationCookie(`${altBody}.${sig}`);
    expect(v.ok).toBe(false);
  });

  it("rejects an expired cookie", async () => {
    const past = new Date(Date.now() - 5 * 60_000);
    const cookie = await signImpersonationCookie({
      impersonator_id: SUPER_ID,
      organization_id: ORG_ID,
      started_at: new Date(past.getTime() - IMPERSONATION_WINDOW_MS),
      expires_at: past,
    });
    expect(await verifyImpersonationCookie(cookie)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a bad format string", async () => {
    expect(await verifyImpersonationCookie("not-a-cookie")).toEqual({
      ok: false,
      reason: "bad_format",
    });
    expect(await verifyImpersonationCookie("body.sig.too.many")).toEqual({
      ok: false,
      reason: "bad_format",
    });
  });

  it("exports the expected constants", () => {
    expect(IMPERSONATION_COOKIE).toBe("impersonation_session");
    expect(IMPERSONATION_WINDOW_MS).toBe(30 * 60 * 1000);
  });
});
