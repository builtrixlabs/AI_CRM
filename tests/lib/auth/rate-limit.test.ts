import { describe, expect, it, beforeEach } from "vitest";
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_SECONDS,
  MemoryLimiter,
  loginBucket,
} from "@/lib/auth/rate-limit";

describe("MemoryLimiter (sliding-window-log)", () => {
  let b: MemoryLimiter;
  beforeEach(() => {
    b = new MemoryLimiter({ capacity: 5, window_ms: 60_000 });
  });

  it("allows exactly capacity calls before blocking", async () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const r = await b.consume("ip-A", now);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const r6 = await b.consume("ip-A", now);
    expect(r6.allowed).toBe(false);
    expect(r6.remaining).toBe(0);
    expect(r6.retry_after_ms).toBeGreaterThan(0);
  });

  it("isolates keys (different IPs each get their own counter)", async () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) await b.consume("ip-A", now);
    const r = await b.consume("ip-B", now);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("ages out timestamps after the window elapses", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) await b.consume("ip-A", t0);
    expect((await b.consume("ip-A", t0)).allowed).toBe(false);
    const r = await b.consume("ip-A", t0 + 60_001);
    expect(r.allowed).toBe(true);
  });

  it("retry_after_ms tracks the oldest live timestamp", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) await b.consume("ip-A", t0 + i * 1000);
    const blocked = await b.consume("ip-A", t0 + 5000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retry_after_ms).toBe(60_000 - 5000);
  });

  it("partial window: 4 of 5 timestamps still alive after window/2 elapsed", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) await b.consume("ip-A", t0);
    const r = await b.consume("ip-A", t0 + 30_000);
    expect(r.allowed).toBe(false);
    expect(r.retry_after_ms).toBe(30_000);
  });

  it("_reset clears all keys", async () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) await b.consume("ip-A", now);
    expect((await b.consume("ip-A", now)).allowed).toBe(false);
    b._reset();
    expect((await b.consume("ip-A", now)).allowed).toBe(true);
  });
});

describe("loginBucket constants + singleton", () => {
  it("exposes LOGIN_LIMIT=5 and LOGIN_WINDOW_SECONDS=60", () => {
    expect(LOGIN_LIMIT).toBe(5);
    expect(LOGIN_WINDOW_SECONDS).toBe(60);
  });

  it("loginBucket is a singleton with the Limiter shape", async () => {
    loginBucket._reset();
    const r = await loginBucket.consume("ip-singleton", 1);
    expect(r.allowed).toBe(true);
    loginBucket._reset();
  });
});
