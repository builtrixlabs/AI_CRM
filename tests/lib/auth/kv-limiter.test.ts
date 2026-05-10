import { describe, expect, it, vi } from "vitest";
import { KvLimiter } from "@/lib/auth/rate-limit";

type EvalFn = (
  script: string,
  keys: string[],
  args: string[]
) => Promise<unknown>;

function makeFakeRedis(behaviour: EvalFn) {
  return { eval: vi.fn(behaviour) };
}

describe("KvLimiter — Lua script orchestration", () => {
  it("parses [allowed, remaining, retry_after] tuple from EVAL", async () => {
    const fake = makeFakeRedis(async () => [1, 4, 0]);
    const l = new KvLimiter(fake, {
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "test",
    });
    const r = await l.consume("ip-A", 1_000_000);
    expect(r).toEqual({ allowed: true, remaining: 4, retry_after_ms: 0 });
  });

  it("denied response surfaces retry_after_ms", async () => {
    const fake = makeFakeRedis(async () => [0, 0, 12_345]);
    const l = new KvLimiter(fake, {
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "test",
    });
    const r = await l.consume("ip-A", 1_000_000);
    expect(r).toEqual({ allowed: false, remaining: 0, retry_after_ms: 12_345 });
  });

  it("invokes EVAL with the namespaced key + numeric args as strings", async () => {
    const seen: { keys: string[]; args: string[] }[] = [];
    const fake = makeFakeRedis(async (_script, keys, args) => {
      seen.push({ keys, args });
      return [1, 4, 0];
    });
    const l = new KvLimiter(fake, {
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "myprefix",
    });
    await l.consume("ip-A", 1_700_000_000_000);
    expect(seen).toHaveLength(1);
    expect(seen[0].keys).toEqual(["myprefix:ip-A"]);
    expect(seen[0].args).toEqual(["1700000000000", "60000", "5"]);
  });

  it("fail-open on KV throw: returns allowed with full capacity remaining", async () => {
    const fake = makeFakeRedis(async () => {
      throw new Error("ECONNRESET");
    });
    const l = new KvLimiter(fake, {
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "test",
    });
    const r = await l.consume("ip-A", 1_000_000);
    expect(r).toEqual({ allowed: true, remaining: 5, retry_after_ms: 0 });
  });

  it("fail-open on EVAL returning malformed shape", async () => {
    const fake = makeFakeRedis(async () => "not-an-array");
    const l = new KvLimiter(fake, {
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "test",
    });
    const r = await l.consume("ip-A", 1_000_000);
    expect(r.allowed).toBe(false); // arr defaults [0, 0, 0] -> allowed=0
  });

  it("different keys are isolated by prefix:key", async () => {
    const seen: string[] = [];
    const fake = makeFakeRedis(async (_s, keys) => {
      seen.push(keys[0]!);
      return [1, 4, 0];
    });
    const l = new KvLimiter(fake, {
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "test",
    });
    await l.consume("ip-A");
    await l.consume("ip-B");
    expect(seen).toEqual(["test:ip-A", "test:ip-B"]);
  });

  it("_reset is a no-op (KV state is shared, no local cache)", async () => {
    const fake = makeFakeRedis(async () => [1, 4, 0]);
    const l = new KvLimiter(fake, {
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "test",
    });
    expect(() => l._reset()).not.toThrow();
  });
});
