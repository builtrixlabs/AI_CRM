import { Redis } from "@upstash/redis";

export type ConsumeResult = {
  allowed: boolean;
  remaining: number;
  retry_after_ms: number;
};

export interface Limiter {
  consume(key: string, now?: number): Promise<ConsumeResult>;
  _reset(): void;
}

export type LimiterOpts = {
  capacity: number;
  window_ms: number;
  key_prefix: string;
};

/**
 * Single-instance sliding-window-log limiter. Keyed by an opaque string
 * (typically IP, user_id, or email). Used in dev/test/single-instance
 * deployments. Multi-instance correctness comes from `KvLimiter`.
 *
 * Algorithm: per-key array of recent timestamps. On consume(), prune
 * entries older than `window_ms`, count survivors. If count >= capacity,
 * deny with retry_after_ms = (oldest_survivor + window_ms) - now. Else
 * append `now` and allow.
 *
 * This matches the KvLimiter Lua script exactly so dev and prod behave
 * identically.
 */
export class MemoryLimiter implements Limiter {
  private readonly map = new Map<string, number[]>();

  constructor(
    private readonly opts: { capacity: number; window_ms: number }
  ) {}

  async consume(
    key: string,
    now: number = Date.now()
  ): Promise<ConsumeResult> {
    const { capacity, window_ms } = this.opts;
    const cutoff = now - window_ms;
    const existing = this.map.get(key) ?? [];
    const live = existing.filter((t) => t > cutoff);

    if (live.length >= capacity) {
      const oldest = live[0]!;
      const retry_after_ms = Math.max(0, oldest + window_ms - now);
      this.map.set(key, live);
      return { allowed: false, remaining: 0, retry_after_ms };
    }

    live.push(now);
    this.map.set(key, live);
    return {
      allowed: true,
      remaining: Math.max(0, capacity - live.length),
      retry_after_ms: 0,
    };
  }

  _reset(): void {
    this.map.clear();
  }
}

/**
 * Sliding-window-log limiter backed by Upstash Redis (Vercel KV).
 * Multi-instance safe — every instance reads/writes the same keys.
 *
 * Algorithm: a single Lua EVAL atomically prunes old entries, counts
 * survivors, and either appends + allows or returns retry_after_ms.
 * Single round-trip per consume.
 *
 * Fail-open on KV outage (network error, 5xx, timeout > 1s) — better
 * to let traffic through than to 500-storm a deploy. Logged via
 * console.warn for visibility.
 */
const KV_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)
local count = redis.call('ZCARD', key)
if count >= capacity then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = 0
  if #oldest >= 2 then
    retry_after = math.max(0, math.floor(tonumber(oldest[2])) + window_ms - now)
  end
  return {0, 0, retry_after}
end
redis.call('ZADD', key, now, now)
redis.call('EXPIRE', key, math.ceil(window_ms / 1000) + 1)
return {1, capacity - count - 1, 0}
`;

const KV_TIMEOUT_MS = 1000;

export class KvLimiter implements Limiter {
  constructor(
    private readonly client: Pick<Redis, "eval">,
    private readonly opts: LimiterOpts
  ) {}

  async consume(
    key: string,
    now: number = Date.now()
  ): Promise<ConsumeResult> {
    const { capacity, window_ms, key_prefix } = this.opts;
    const fullKey = `${key_prefix}:${key}`;
    try {
      const raced = await Promise.race([
        this.client.eval(
          KV_LUA,
          [fullKey],
          [String(now), String(window_ms), String(capacity)]
        ) as Promise<unknown>,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("kv-timeout")), KV_TIMEOUT_MS)
        ),
      ]);
      const arr = Array.isArray(raced) ? (raced as unknown[]) : [];
      const allowed = Number(arr[0] ?? 0) === 1;
      const remaining = Number(arr[1] ?? 0);
      const retry_after_ms = Number(arr[2] ?? 0);
      return { allowed, remaining, retry_after_ms };
    } catch (err) {
      console.warn(
        "[rate-limit] KV outage, failing open:",
        err instanceof Error ? err.message : err
      );
      return { allowed: true, remaining: capacity, retry_after_ms: 0 };
    }
  }

  _reset(): void {
    /* no-op: KV state is shared across instances. Tests should mock
     * the client rather than rely on local reset. */
  }
}

let kvSingleton: Redis | null = null;

function getKvClient(): Redis | null {
  if (process.env.RATE_LIMIT_BACKEND === "memory") return null;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  if (!kvSingleton) {
    kvSingleton = new Redis({ url, token });
  }
  return kvSingleton;
}

/**
 * Picks the right backend at call time:
 *   - `RATE_LIMIT_BACKEND=memory`  -> MemoryLimiter (forced)
 *   - `KV_REST_API_URL`+`_TOKEN`   -> KvLimiter
 *   - otherwise                    -> MemoryLimiter (dev / test fallback)
 *
 * Production should always have the KV env present. A single warning is
 * emitted at module load if NODE_ENV=production and KV env is missing.
 */
export function createLimiter(opts: LimiterOpts): Limiter {
  const kv = getKvClient();
  if (kv) return new KvLimiter(kv, opts);
  return new MemoryLimiter(opts);
}

if (
  process.env.NODE_ENV === "production" &&
  process.env.RATE_LIMIT_BACKEND !== "memory" &&
  (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN)
) {
  console.warn(
    "[rate-limit] NODE_ENV=production but KV_REST_API_URL / KV_REST_API_TOKEN missing. Falling back to MemoryLimiter — multi-instance correctness LOST. Set the env vars or RATE_LIMIT_BACKEND=memory to silence."
  );
}

export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_SECONDS = 60;
export const loginBucket: Limiter = createLimiter({
  capacity: LOGIN_LIMIT,
  window_ms: LOGIN_WINDOW_SECONDS * 1000,
  key_prefix: "login",
});

export const LOGIN_ACCOUNT_LIMIT = 20;
export const LOGIN_ACCOUNT_WINDOW_SECONDS = 60 * 60;
export const loginAccountBucket: Limiter = createLimiter({
  capacity: LOGIN_ACCOUNT_LIMIT,
  window_ms: LOGIN_ACCOUNT_WINDOW_SECONDS * 1000,
  key_prefix: "login:acct",
});

export const MFA_VERIFY_LIMIT = 5;
export const MFA_VERIFY_WINDOW_SECONDS = 15 * 60;
export const mfaVerifyBucket: Limiter = createLimiter({
  capacity: MFA_VERIFY_LIMIT,
  window_ms: MFA_VERIFY_WINDOW_SECONDS * 1000,
  key_prefix: "mfa",
});

export const LOOKUP_LIMIT = 5;
export const LOOKUP_WINDOW_SECONDS = 15 * 60;
export const lookupBucket: Limiter = createLimiter({
  capacity: LOOKUP_LIMIT,
  window_ms: LOOKUP_WINDOW_SECONDS * 1000,
  key_prefix: "lookup",
});

export function ipKey(req: Request | { headers: Headers }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
