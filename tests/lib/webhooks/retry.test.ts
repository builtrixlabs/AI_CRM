import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  nextRetryAt,
} from "@/lib/webhooks/retry";

describe("retry.nextRetryAt", () => {
  const now = 1_700_000_000_000;

  it("schedules attempt 2 +1m after attempt 1 completes", () => {
    const r = nextRetryAt(1, now);
    expect(r).toBe(new Date(now + 60_000).toISOString());
  });

  it("schedules attempt 3 +5m after attempt 2", () => {
    const r = nextRetryAt(2, now);
    expect(r).toBe(new Date(now + 5 * 60_000).toISOString());
  });

  it("schedules attempt 4 +30m after attempt 3", () => {
    const r = nextRetryAt(3, now);
    expect(r).toBe(new Date(now + 30 * 60_000).toISOString());
  });

  it("schedules attempt 5 +2h after attempt 4", () => {
    const r = nextRetryAt(4, now);
    expect(r).toBe(new Date(now + 2 * 60 * 60_000).toISOString());
  });

  it("schedules attempt 6 +12h after attempt 5", () => {
    const r = nextRetryAt(5, now);
    expect(r).toBe(new Date(now + 12 * 60 * 60_000).toISOString());
  });

  it("returns null after attempt 6 (no more retries)", () => {
    expect(nextRetryAt(6, now)).toBeNull();
    expect(nextRetryAt(7, now)).toBeNull();
  });

  it("returns null for invalid attempt numbers (<1)", () => {
    expect(nextRetryAt(0, now)).toBeNull();
    expect(nextRetryAt(-1, now)).toBeNull();
  });

  it("schedule has 5 entries — one per retry between 6 attempts", () => {
    expect(RETRY_DELAYS_MS).toHaveLength(MAX_ATTEMPTS - 1);
  });
});
