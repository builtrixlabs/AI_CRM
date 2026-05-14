// Shared IST day-bucketing helper for the D-602 site-visit module.
// calendar.ts keeps its own private copy intentionally — extracting it
// there would churn an already-tested module for no behavioural gain.

const DEFAULT_TZ = process.env.NEXT_PUBLIC_DEFAULT_TZ ?? "Asia/Kolkata";

/**
 * Local-tz "YYYY-MM-DD" for an instant. Default tz: Asia/Kolkata.
 * Indian operators routinely have visits at 9pm IST that bucket to
 * "tomorrow" in UTC — bucketing must happen in the operator's tz.
 */
export function istDayKey(instant: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export { DEFAULT_TZ as SITE_VISIT_DEFAULT_TZ };
