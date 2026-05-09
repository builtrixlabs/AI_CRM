import { describe, expect, it, beforeEach } from "vitest";
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_SECONDS,
  TokenBucket,
  loginBucket,
} from "@/lib/auth/rate-limit";

describe("TokenBucket", () => {
  let b: TokenBucket;
  beforeEach(() => {
    b = new TokenBucket({ capacity: 5, refill_window_ms: 60_000 });
  });

  it("allows exactly capacity calls before blocking", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const r = b.consume("ip-A", now);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const r6 = b.consume("ip-A", now);
    expect(r6.allowed).toBe(false);
    expect(r6.remaining).toBe(0);
    expect(r6.retry_after_ms).toBeGreaterThan(0);
  });

  it("isolates keys (different IPs each get their own bucket)", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) b.consume("ip-A", now);
    const r = b.consume("ip-B", now);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("refills after the window elapses", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) b.consume("ip-A", t0);
    expect(b.consume("ip-A", t0).allowed).toBe(false);
    // After full window, capacity refills.
    const r = b.consume("ip-A", t0 + 60_001);
    expect(r.allowed).toBe(true);
  });

  it("partial refill (proportional to elapsed time)", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) b.consume("ip-A", t0);
    // Half the window — should refill 2 tokens (floor(0.5 * 5)).
    const r = b.consume("ip-A", t0 + 30_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1); // 0 + 2 refilled - 1 consumed = 1
  });
});

describe("loginBucket constants", () => {
  it("exposes LOGIN_LIMIT=5 and LOGIN_WINDOW_SECONDS=60", () => {
    expect(LOGIN_LIMIT).toBe(5);
    expect(LOGIN_WINDOW_SECONDS).toBe(60);
  });

  it("loginBucket is a singleton (same instance across imports)", () => {
    expect(loginBucket).toBeInstanceOf(TokenBucket);
    loginBucket._reset();
    const r = loginBucket.consume("ip-singleton", 1);
    expect(r.allowed).toBe(true);
    loginBucket._reset();
  });
});
