export type ConsumeResult = {
  allowed: boolean;
  remaining: number;
  retry_after_ms: number;
};

export type BucketOpts = {
  capacity: number;
  refill_window_ms: number;
};

type State = {
  tokens: number;
  last_refill: number;
};

/**
 * Single-instance in-memory token bucket. Keyed by an opaque string
 * (IP). Demo-grade — multi-instance correctness needs Vercel KV /
 * Upstash, scheduled for V3.
 */
export class TokenBucket {
  private map = new Map<string, State>();

  constructor(private readonly opts: BucketOpts) {}

  consume(key: string, now: number = Date.now()): ConsumeResult {
    const cap = this.opts.capacity;
    const window_ms = this.opts.refill_window_ms;
    const cur = this.map.get(key) ?? { tokens: cap, last_refill: now };

    // Refill: add `(elapsed / window_ms) * cap` tokens, capped at `cap`.
    const elapsed = now - cur.last_refill;
    if (elapsed > 0) {
      const refill = Math.floor((elapsed / window_ms) * cap);
      if (refill > 0) {
        cur.tokens = Math.min(cap, cur.tokens + refill);
        cur.last_refill = now;
      }
    }

    if (cur.tokens <= 0) {
      const retry_after_ms = Math.max(
        0,
        cur.last_refill + Math.ceil(window_ms / cap) - now
      );
      this.map.set(key, cur);
      return { allowed: false, remaining: 0, retry_after_ms };
    }

    cur.tokens -= 1;
    this.map.set(key, cur);
    return {
      allowed: true,
      remaining: cur.tokens,
      retry_after_ms: 0,
    };
  }

  /** Test-only hook to clear all keys. */
  _reset(): void {
    this.map.clear();
  }
}

export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_SECONDS = 60;

/**
 * Process-singleton login bucket. Lives at module scope so all incoming
 * /api/auth/rate-check requests share state on the same Vercel instance.
 */
export const loginBucket = new TokenBucket({
  capacity: LOGIN_LIMIT,
  refill_window_ms: LOGIN_WINDOW_SECONDS * 1000,
});

export const MFA_VERIFY_LIMIT = 5;
export const MFA_VERIFY_WINDOW_SECONDS = 15 * 60;

/**
 * Process-singleton MFA verify bucket. Used by /auth/mfa and
 * /auth/mfa/setup server actions to throttle code attempts at
 * 5 / 15min / IP. Multi-instance correctness lands with D-301
 * (KV-backed limiter).
 */
export const mfaVerifyBucket = new TokenBucket({
  capacity: MFA_VERIFY_LIMIT,
  refill_window_ms: MFA_VERIFY_WINDOW_SECONDS * 1000,
});

export function ipKey(req: Request | { headers: Headers }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  const real = req.headers.get("x-real-ip");
  return real ?? "unknown";
}
