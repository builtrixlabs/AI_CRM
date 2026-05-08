import type { DirectiveRow, Trigger } from "./types";

/**
 * Evaluate a directive's `trigger_config` against an incoming payload.
 *
 * V0 supports a small predicate set chosen by `trigger_kind`:
 *   - exact-match: `{ to: 'negotiation' }` against `payload.to`
 *   - thresholds: `{ threshold: 75 }` against `payload.value`
 *   - idle hours: `{ idle_hours: 24 }` against `payload.idle_hours`
 *   - source match: `{ source: 'walkin' }` against `payload.source`
 *
 * Unknown keys are ignored (the runtime owns matching by `trigger_kind`;
 * `trigger_config` only narrows within that kind).
 */
export function evaluateCondition(
  directive: DirectiveRow,
  trigger: Trigger
): { ok: true } | { ok: false; reason: string } {
  const cfg = directive.trigger_config ?? {};
  const payload = trigger.payload ?? {};

  // Generic exact-match keys.
  for (const key of ["state", "to", "from", "objection", "source", "audience"] as const) {
    if (cfg[key] != null && payload[key] !== cfg[key]) {
      return {
        ok: false,
        reason: `${key}=${String(payload[key])} != ${String(cfg[key])}`,
      };
    }
  }

  // Threshold (gte).
  if (typeof cfg.threshold === "number") {
    const value =
      typeof payload.value === "number"
        ? payload.value
        : typeof payload.score === "number"
          ? payload.score
          : null;
    if (value == null || value < cfg.threshold) {
      return {
        ok: false,
        reason: `value=${String(value)} < threshold=${cfg.threshold}`,
      };
    }
  }

  // min_score (gte).
  if (typeof cfg.min_score === "number") {
    const score =
      typeof payload.score === "number" ? payload.score : null;
    if (score == null || score < cfg.min_score) {
      return {
        ok: false,
        reason: `score=${String(score)} < min_score=${cfg.min_score}`,
      };
    }
  }

  // idle_hours (gte).
  if (typeof cfg.idle_hours === "number") {
    const idle =
      typeof payload.idle_hours === "number" ? payload.idle_hours : null;
    if (idle == null || idle < cfg.idle_hours) {
      return {
        ok: false,
        reason: `idle_hours=${String(idle)} < threshold=${cfg.idle_hours}`,
      };
    }
  }

  // hours_until (window match within ±15min slack — runtime
  // typically passes a discrete value: 24 or 2).
  if (typeof cfg.hours_until === "number") {
    const hu =
      typeof payload.hours_until === "number" ? payload.hours_until : null;
    if (hu == null) return { ok: false, reason: "hours_until missing" };
    const slack = 0.5;
    if (Math.abs(hu - cfg.hours_until) > slack) {
      return {
        ok: false,
        reason: `hours_until=${hu} not within ${slack}h of ${cfg.hours_until}`,
      };
    }
  }

  return { ok: true };
}
