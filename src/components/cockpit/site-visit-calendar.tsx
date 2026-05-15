import Link from "next/link";
import {
  type CalendarDay,
  dominantState,
  type SiteVisitState,
} from "@/lib/sitevisits/calendar-types";

const STATE_TINT: Record<SiteVisitState, string> = {
  draft: "border-slate-300 bg-slate-50 text-slate-600",
  scheduled: "border-blue-300 bg-blue-50 text-blue-900",
  confirmed: "border-emerald-300 bg-emerald-50 text-emerald-900",
  in_progress: "border-amber-300 bg-amber-50 text-amber-900",
  completed: "border-neutral-300 bg-neutral-50 text-neutral-900",
  cancelled: "border-neutral-300 bg-neutral-100 text-neutral-500",
  no_show: "border-red-300 bg-red-50 text-red-900",
};

function weekdayShort(dateKey: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  });
  return fmt.format(new Date(`${dateKey}T12:00:00Z`));
}

function dayNumber(dateKey: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    day: "numeric",
  });
  return fmt.format(new Date(`${dateKey}T12:00:00Z`));
}

export type SiteVisitCalendarProps = {
  days: CalendarDay[];
  tz?: string;
  /** Optional `?date=` link target prefix; default `/dashboard/site-visits`. */
  hrefPrefix?: string;
};

export function SiteVisitCalendar({
  days,
  tz = "Asia/Kolkata",
  hrefPrefix = "/dashboard/site-visits",
}: SiteVisitCalendarProps) {
  const total = days.reduce((sum, d) => sum + d.total, 0);

  if (total === 0) {
    return (
      <div className="rounded-md border bg-white p-6 text-sm text-neutral-600">
        No site visits scheduled this week — quiet week ahead.
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-7 gap-2"
      role="list"
      aria-label="Next 7 days of site visits"
    >
      {days.map((d) => {
        const state = dominantState(d);
        const tint = state
          ? STATE_TINT[state]
          : "border-neutral-200 bg-white text-neutral-400";
        return (
          <Link
            key={d.date}
            href={`${hrefPrefix}?date=${d.date}`}
            role="listitem"
            aria-label={`${weekdayShort(d.date, tz)} ${dayNumber(d.date, tz)}: ${d.total} visit${d.total === 1 ? "" : "s"}`}
            className={`block rounded-md border ${tint} p-3 text-center transition hover:shadow-sm`}
          >
            <div className="text-xs uppercase tracking-wide">
              {weekdayShort(d.date, tz)}
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {dayNumber(d.date, tz)}
            </div>
            <div className="text-xs">
              {d.total === 0 ? "—" : `${d.total} visit${d.total === 1 ? "" : "s"}`}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
