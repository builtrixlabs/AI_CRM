/**
 * D-311 — exponential-ish backoff schedule for outbound webhook retries.
 * 5 attempts total: the first POST is attempt 1; on transient failure we
 * schedule attempt 2 for 1 minute later, 3 for 5 minutes after that, etc.
 *
 *   attempt 1 -> immediate (set by enqueueDelivery)
 *   attempt 2 -> +1   min
 *   attempt 3 -> +5   min
 *   attempt 4 -> +30  min
 *   attempt 5 -> +120 min   (2h)
 *   attempt 6 -> +720 min   (12h) — last try
 *   attempt 7 -> null (dead)
 */

export const RETRY_DELAYS_MS: ReadonlyArray<number> = [
  60_000, // 1m   -> attempt 2
  5 * 60_000, // 5m   -> attempt 3
  30 * 60_000, // 30m  -> attempt 4
  2 * 60 * 60_000, // 2h   -> attempt 5
  12 * 60 * 60_000, // 12h  -> attempt 6
];

export const MAX_ATTEMPTS = 6;

/**
 * Given the *just-completed* attempt number, return when the next
 * attempt should fire. Returns null if no more retries should happen
 * (the row should be marked dead).
 *
 *   nextRetryAt(1, now) -> now + 1m   (schedule attempt 2)
 *   nextRetryAt(5, now) -> now + 12h  (schedule attempt 6)
 *   nextRetryAt(6, now) -> null       (out of retries)
 */
export function nextRetryAt(
  completed_attempt: number,
  now: number = Date.now()
): string | null {
  if (completed_attempt < 1) return null;
  if (completed_attempt >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[completed_attempt - 1];
  if (delay === undefined) return null;
  return new Date(now + delay).toISOString();
}
