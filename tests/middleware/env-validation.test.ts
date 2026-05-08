/**
 * Regression: Vercel `MIDDLEWARE_INVOCATION_FAILED` on first deploy
 *  ─────────────────────────────────────────────────────────────────
 *
 * Date: 2026-05-08
 * Symptom: 500 + `Code: MIDDLEWARE_INVOCATION_FAILED` on every page
 *   of a fresh Vercel deploy.
 * Cause: `@supabase/ssr`'s `createServerClient(url, key, ...)` throws
 *   synchronously when `url` or `key` is empty. Local dev never tripped
 *   it because `.env.local` was always present; Vercel doesn't read
 *   `.env.local`, so prod started up with `process.env.NEXT_PUBLIC_*`
 *   undefined.
 * Fix: middleware validates env vars BEFORE calling the Supabase
 *   constructor and returns an actionable 500 instead of throwing.
 *
 * These tests pin the contract so the regression cannot return:
 *
 *   1. With BOTH supabase env vars set → middleware does not throw and
 *      does NOT return the env-error 500.
 *   2. With either env var empty → middleware returns a 500 whose body
 *      names the missing variable (operator-actionable, not opaque).
 *   3. Middleware NEVER throws — it always returns a Response. This
 *      is the load-bearing invariant: as long as the middleware
 *      returns a Response, Vercel will NOT surface
 *      `MIDDLEWARE_INVOCATION_FAILED`.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: vi.fn(async () => null),
}));

function makeReq(pathname: string = "/dashboard"): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`));
}

beforeEach(() => {
  // Wipe potentially-set values; tests set what they need explicitly.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  // Force a fresh module import each test so the module-level
  // `SUPABASE_URL`/`SUPABASE_KEY` constants pick up the current env.
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("middleware — env validation regression for MIDDLEWARE_INVOCATION_FAILED", () => {
  it("returns a 500 with an actionable body when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_value";
    const { middleware } = await import("@/middleware");

    const res = await middleware(makeReq());

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(body).toContain("Vercel"); // operator instruction included
  });

  it("returns a 500 with an actionable body when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    const { middleware } = await import("@/middleware");

    const res = await middleware(makeReq());

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("names BOTH missing vars when both are absent", async () => {
    const { middleware } = await import("@/middleware");

    const res = await middleware(makeReq());

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(body).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("DOES NOT throw — returns a Response — even with empty env (the invariant Vercel needs)", async () => {
    const { middleware } = await import("@/middleware");

    // The original bug: this call threw, Vercel saw an unhandled
    // exception, surfaced MIDDLEWARE_INVOCATION_FAILED. We pin
    // "must not throw" as a separate assertion because it's the
    // load-bearing contract regardless of body content.
    let threw: unknown = null;
    let res: Response | null = null;
    try {
      res = await middleware(makeReq());
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeNull();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500); // env-validation 500, NOT a thrown error
  });

  it("does NOT serve the env-error 500 when both vars are populated", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_value";
    const { middleware } = await import("@/middleware");

    const res = await middleware(makeReq());

    // With env present and the user mocked to null, the route policy
    // for /dashboard is "redirect to /auth/sign-in" — NOT a 500.
    // The exact status (307 redirect or 200 allow) depends on
    // route-policy; the contract here is just "not 500".
    expect(res.status).not.toBe(500);
  });

  it("falls back to non-NEXT_PUBLIC_-prefixed names (server-only deploys)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk_test_value";
    const { middleware } = await import("@/middleware");

    const res = await middleware(makeReq());
    expect(res.status).not.toBe(500);
  });
});
