import { afterEach, describe, expect, it } from "vitest";
import {
  KvLimiter,
  MemoryLimiter,
  createLimiter,
} from "@/lib/auth/rate-limit";

const ENV_KEYS = [
  "RATE_LIMIT_BACKEND",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

const original: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) original[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("createLimiter factory", () => {
  it("falls back to MemoryLimiter when KV env is absent", () => {
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const l = createLimiter({
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "x",
    });
    expect(l).toBeInstanceOf(MemoryLimiter);
  });

  it("returns KvLimiter when both KV env vars are present", () => {
    delete process.env.RATE_LIMIT_BACKEND;
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "fake-token";
    const l = createLimiter({
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "x",
    });
    expect(l).toBeInstanceOf(KvLimiter);
  });

  it("RATE_LIMIT_BACKEND=memory forces MemoryLimiter even with KV env present", () => {
    process.env.RATE_LIMIT_BACKEND = "memory";
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "fake-token";
    const l = createLimiter({
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "x",
    });
    expect(l).toBeInstanceOf(MemoryLimiter);
  });

  it("partial KV env (URL only) falls back to MemoryLimiter", () => {
    delete process.env.RATE_LIMIT_BACKEND;
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    delete process.env.KV_REST_API_TOKEN;
    const l = createLimiter({
      capacity: 5,
      window_ms: 60_000,
      key_prefix: "x",
    });
    expect(l).toBeInstanceOf(MemoryLimiter);
  });
});
