import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type { CalendarDay, SiteVisitState } from "./calendar-types";
export { dominantState } from "./calendar-types";

import type { CalendarDay, SiteVisitState } from "./calendar-types";

const STATES: SiteVisitState[] = [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
];

function emptyBuckets(): Record<SiteVisitState, number> {
  return { scheduled: 0, confirmed: 0, completed: 0, no_show: 0 };
}

/**
 * Local-day bucket helper. We do the bucketing in JS (rather than pushing it
 * to Postgres) because Supabase's `date_trunc` defaults to UTC and the
 * real-estate operator audience is timezone-sensitive — Indian operators
 * routinely have visits at 9pm IST that bucket to "tomorrow" in UTC.
 *
 * Passing a tz like "Asia/Kolkata" returns the local-yyyy-mm-dd of `instant`.
 */
function localDateKey(instant: Date, tz: string): string {
  // Intl.DateTimeFormat with a fixed format gives us a stable yyyy-mm-dd.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(instant); // e.g. "2026-05-09"
}

/**
 * Generate `days` consecutive day-keys starting from `start` (local tz).
 */
function rollingDays(start: Date, days: number, tz: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    keys.push(localDateKey(d, tz));
  }
  return keys;
}

export type CalendarOpts = {
  days?: number;
  tz?: string;
  /** Inject for tests. Defaults to `new Date()`. */
  now?: () => Date;
};

export async function getSiteVisitCalendar(
  organization_id: string,
  opts: CalendarOpts = {},
  client: SupabaseClient = getSupabaseAdmin()
): Promise<CalendarDay[]> {
  const days = opts.days ?? 7;
  const tz =
    opts.tz ?? process.env.NEXT_PUBLIC_DEFAULT_TZ ?? "Asia/Kolkata";
  const now = opts.now ? opts.now() : new Date();

  // Compute local "start of today" by converting "now" → tz-local yyyy-mm-dd
  // then re-anchoring at 00:00 in the same tz (approximate via UTC offset
  // — good enough for a 7-day window UI; not cross-DST sensitive).
  const todayKey = localDateKey(now, tz);
  // Anchor: midnight UTC of todayKey, then expand the window with a 36h pad
  // on each side so we definitely capture all visits whose local-tz date
  // falls in our window even if their stored UTC is on the boundary.
  const todayUtc = new Date(`${todayKey}T00:00:00Z`);
  const fromUtc = new Date(todayUtc.getTime() - 36 * 60 * 60 * 1000);
  const toUtc = new Date(
    todayUtc.getTime() + (days + 1) * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000
  );

  const { data, error } = await client
    .from("nodes")
    .select("id, state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "site_visit")
    .is("deleted_at", null)
    .gte("data->>scheduled_at", fromUtc.toISOString())
    .lte("data->>scheduled_at", toUtc.toISOString());

  const dayKeys = rollingDays(now, days, tz);
  const buckets = new Map<string, Record<SiteVisitState, number>>();
  for (const k of dayKeys) buckets.set(k, emptyBuckets());

  if (!error && data) {
    for (const r of data as Array<{
      state: string;
      data: { scheduled_at?: string };
    }>) {
      const at = r.data?.scheduled_at;
      if (!at) continue;
      const instant = new Date(at);
      if (isNaN(instant.getTime())) continue;
      const key = localDateKey(instant, tz);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const state = (STATES as string[]).includes(r.state)
        ? (r.state as SiteVisitState)
        : "scheduled";
      bucket[state] += 1;
    }
  }

  return dayKeys.map((key) => {
    const by_state = buckets.get(key)!;
    const total =
      by_state.scheduled +
      by_state.confirmed +
      by_state.completed +
      by_state.no_show;
    return {
      date: key,
      date_utc: new Date(`${key}T00:00:00Z`).toISOString(),
      total,
      by_state,
    };
  });
}

