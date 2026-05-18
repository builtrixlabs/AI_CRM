# Directive 205 — `/platform/analytics` real-estate KPIs

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-205
**Builds on:** D-204 (api_audit_log feeds API call counts), D-132 (org_integration_secrets feeds VIQ adoption).

---

## Problem

`/platform/analytics` is a placeholder. Customers expect real metrics that speak to the real-estate motion — not generic SaaS charts.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New library `src/lib/platform/analytics.ts` returning a `PlatformKpis` rollup. 4 widgets:
  1. **Orgs by plan tier** — count per starter / professional / enterprise / custom.
  2. **Lead-to-booking conversion %** — `count(deals where state='booked') / count(deals where state='qualified' or downstream)` org-wide.
  3. **Site-visit cadence (30d)** — total per state across all orgs (scheduled / confirmed / completed / no_show).
  4. **Voice IQ adoption** — `count(orgs with row in org_integration_secrets where kind='voice_iq_inbox_secret') / total_orgs * 100`.
- [ ] **AC-2** Page `/platform/analytics/page.tsx` Server Component (super_admin only). 4 cards rendering each KPI. No charting library — numbers + simple proportional bars.
- [ ] **AC-3** Empty-state graceful: shows "—" or "0%" when denominator is zero, never `NaN`.

## Tests

- [ ] **AC-4** Unit tests for the lib (4 KPIs covered).
- [ ] **AC-5** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Time-series / sparklines — V3.
- Per-org detail drill — V3 (use existing org-detail page).
- Export to CSV — V3.

## Stack

shadcn Card + Tailwind, no charting deps.
