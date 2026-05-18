/**
 * Regression: 404 on /auth/mfa/setup after super_admin sign-in
 *  ──────────────────────────────────────────────────────────────
 *
 * Date: 2026-05-11
 * Symptom: After successful sign-in, super_admin redirected to
 *   `/auth/mfa/setup%3Freturn=%2Fplatform` (URL-encoded ? and /) →
 *   Next.js returned 404 because no route matches that literal path.
 * Cause: middleware.ts set `url.pathname = decision.target` where
 *   `decision.target` was the full string `/auth/mfa/setup?return=/platform`.
 *   The WHATWG URL spec encodes "?" to "%3F" inside `pathname` because
 *   pathname is supposed to be the path component only.
 *   Then `url.search = ""` wiped any chance of recovery.
 * Fix: split decision.target on the first "?" and assign pathname +
 *   search separately.
 *
 * These tests pin the contract:
 *   1. Redirect with pure path target → pathname is the target, search empty.
 *   2. Redirect with path + query → pathname is the path part, search is
 *      "?...", final URL is a valid `/path?query` not `/path%3Fquery`.
 *   3. Redirect with multiple "?" in the value → only first "?" splits.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_value";
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

function makeReq(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`));
}

describe("middleware redirect — query-string preservation", () => {
  it("preserves '?' and query when route-policy returns target with query string", async () => {
    // Mock getCurrentUser to return a user without MFA enrolled, so the
    // route policy redirects /platform → /auth/mfa/setup?return=/platform.
    vi.doMock("@/lib/auth/getCurrentUser", () => ({
      getCurrentUser: vi.fn(async () => ({
        user: { id: "u1", email: "super@example" },
        profile: {
          id: "u1",
          display_name: "super",
          base_role: "super_admin" as const,
          phone: null,
          notification_prefs: {},
          theme: "system" as const,
          mfa_verified_at: null,
          mfa_enrolled_at: null,
        },
        org_id: null,
        workspace_ids: [],
        app_roles: [],
      })),
    }));
    vi.doMock("@/lib/auth/freshness", () => ({
      isMfaFresh: () => false,
      defaultFreshnessMs: () => 8 * 3600 * 1000,
    }));
    vi.doMock("@/lib/auth/route-policy", () => ({
      decideRoute: () => ({
        kind: "redirect",
        target: "/auth/mfa/setup?return=%2Fplatform",
      }),
    }));

    const { middleware } = await import("@/middleware");
    const res = await middleware(makeReq("/platform"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth/mfa/setup");
    expect(location).toContain("?return=");
    // The bug emitted "%3Freturn=" — explicitly assert that doesn't happen.
    expect(location).not.toContain("%3F");
    expect(location).not.toContain("mfa/setup%3F");
  });

  it("plain path target (no '?') still works — pathname set, search empty", async () => {
    vi.doMock("@/lib/auth/getCurrentUser", () => ({
      getCurrentUser: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/auth/route-policy", () => ({
      decideRoute: () => ({ kind: "redirect", target: "/auth/sign-in" }),
    }));

    const { middleware } = await import("@/middleware");
    const res = await middleware(makeReq("/dashboard"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/\/auth\/sign-in$/);
    // No accidental ? in path.
    expect(location).not.toContain("%3F");
  });

  it("redirect target with multiple '?' splits only on the first one", async () => {
    vi.doMock("@/lib/auth/getCurrentUser", () => ({
      getCurrentUser: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/auth/route-policy", () => ({
      decideRoute: () => ({
        kind: "redirect",
        target: "/auth/mfa?return=%2Fplatform%3Fdebug%3D1",
      }),
    }));

    const { middleware } = await import("@/middleware");
    const res = await middleware(makeReq("/platform?debug=1"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    // pathname segment is /auth/mfa, search starts with first '?'
    expect(location).toContain("/auth/mfa?return=");
    // Encoded '?' INSIDE the query value (i.e. %3F inside return=...) is
    // preserved as-is — that's the deliberate nested encoding, not the bug.
    expect(location).toContain("%3F");
    // But the literal sequence "auth/mfa%3F" must NOT appear.
    expect(location).not.toContain("mfa%3F");
  });
});
