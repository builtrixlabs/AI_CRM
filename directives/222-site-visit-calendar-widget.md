# Directive 222 — Site-visit calendar widget on /admin cockpit

**Kind:** feature (V2 / Phase C — real-estate showcase)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §5 D-222
**Authority:** Constitution III (provenance), no schema changes
**Builds on:** D-012 (site visits + reminder agent), D-005 (admin cockpit)

---

## Problem

Site visits are the cardinal real-estate sales action — a deal lives or dies by whether the prospect actually walks through the property. The admin cockpit today shows leads, users, billing, but not site visits. Operators need to glance at "what's happening this week".

D-222 ships a 7-day calendar strip on `/admin` showing per-day site-visit counts, color-coded by status.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New library `src/lib/sitevisits/calendar.ts`: `getSiteVisitCalendar(organization_id, days = 7)` returns 7 day buckets `[{date, total, by_state: {scheduled, confirmed, completed, no_show}}]`.
- [ ] **AC-2** New component `src/components/cockpit/site-visit-calendar.tsx`: renders a horizontal 7-cell strip, each cell shows weekday + date number + total count badge (color reflects dominant status). Empty days dim.
- [ ] **AC-3** Click a day → links to `/dashboard/site-visits?date=YYYY-MM-DD` (the dashboard route may not exist yet — that's OK; for demo lens we just attach a link, dashboard surface lands V3).
- [ ] **AC-4** Wired into `/admin` cockpit page beneath the "Account state" row, before "Configuration".
- [ ] **AC-5** Color logic: a day with any `no_show` shows red trim; otherwise dominant of {scheduled=blue, confirmed=green, completed=neutral}.
- [ ] **AC-6** Days are local-tz aware — uses caller's date in the org's display tz (defaults to `Asia/Kolkata` for the Indian real-estate target; configurable via `NEXT_PUBLIC_DEFAULT_TZ` env var if needed).
- [ ] **AC-7** No new schema. Reads from existing `nodes` table, `node_type='site_visit'`, `data->>scheduled_at` parsed as ISO timestamp.
- [ ] **AC-8** Empty-state text when org has no site visits in the next 7 days: "No site visits scheduled this week — quiet week ahead."

## Tests

- [ ] **AC-9** Unit tests for `getSiteVisitCalendar`: empty → 7 zero-buckets; mixed states tally correctly; visits outside the 7-day window excluded; tz boundaries respected for the start of "today".
- [ ] **AC-10** RTL test for the widget: renders 7 cells; counts visible; empty state text on 0 visits; status colour class applied per dominant state.
- [ ] **AC-11** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Drag-and-drop reschedule from the widget — V3.
- Per-rep filter — V3 (managers see org-wide, reps see their own).
- Hour-by-hour hot-strip — V3.
- Notification badge for upcoming visits — V3 (existing reminder agent already covers).

## Stack

shadcn Badge + Card + Tailwind (existing), no new deps. Library uses date-fns (already a dependency) for date math.
