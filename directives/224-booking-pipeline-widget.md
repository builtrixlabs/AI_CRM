# Directive 224 — Booking-pipeline dashboard widget

**Kind:** feature (V2 / Phase C — real-estate showcase)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §5 D-224
**Authority:** Constitution III (provenance), no schema changes
**Builds on:** D-021 (per-org dashboard engine + 5 widget types)

---

## Problem

D-021 ships a generic dashboard engine with 5 widget types, none of which speak to the real-estate booking funnel — the canonical sales motion: `qualified → site_visit_scheduled → site_visit_done → negotiation → booked`. Customers expect this visualization out-of-the-box.

D-224 adds `booking_pipeline` as the 6th widget type, computing per-stage deal counts and overall conversion %.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New widget type literal `"booking_pipeline"` added to `WIDGET_TYPES`, `WIDGET_LABEL`, `WIDGET_DESCRIPTION`. The Zod schema (`widgetSpecSchema`) auto-accepts it.
- [ ] **AC-2** New fetcher `fetchBookingPipeline(organization_id, client?)` returns `{ stages: Array<{key, count}>, total_at_top, conversion_rate_overall }` where stages = qualified, site_visit_scheduled, site_visit_done, negotiation, booked.
- [ ] **AC-3** Wired into `fetchWidgetData` switch — exhaustiveness check enforces no missed type.
- [ ] **AC-4** Renderer in `widget-renderers.tsx`: horizontal funnel of 5 stages, each shows label, count, and a thin proportional bar (count / total_at_top). Booked-stage cell tinted emerald. Conversion % shown at the bottom.
- [ ] **AC-5** Empty-state when `total_at_top === 0`: "No deals in the funnel yet."
- [ ] **AC-6** Org admins can add the widget via D-021's existing "+ widget" picker without code changes (because `WIDGET_TYPES` extension flows through validation automatically).

## Tests

- [ ] **AC-7** Unit test for `fetchBookingPipeline`: empty → all zeros + 0% conversion; mixed states tally correctly; conversion rate = booked / qualified.
- [ ] **AC-8** RTL test for the renderer: 5 stages visible, conversion % visible, empty-state text on zero.
- [ ] **AC-9** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Stage-by-stage drop-off rate widget (separate widget type) — V3.
- Per-rep funnel split — V3.
- Time-bucketed funnel (last 30d / 90d) — V3 (current widget is org-wide all-time).

## Stack

shadcn Card + Tailwind. No new deps. Reuses dashboard engine.
