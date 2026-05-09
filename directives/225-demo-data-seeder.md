# Directive 225 — Demo-data seeder (`npm run demo:seed`)

**Kind:** feature (V2 / Phase C — closes the showcase)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §5 D-225 — *the closing piece*
**Authority:** Constitution III (provenance — every seeded row has provenance)
**Builds on:** Every prior v2 directive — the seeder populates each surface

---

## Problem

Every v2 surface (cockpit compliance badges, site-visit calendar, catalog browser, booking-pipeline widget, CP submissions list, Voice IQ delivery log) is empty when the demo starts. Demo screencasts of empty pages are unconvincing. We need a one-command bootstrap that populates a credible real-estate org so every surface lights up.

D-225 ships `npm run demo:seed` — idempotent script that creates "Skyline Realty Pvt Ltd" with users, a project, units, leads at varied stages, deals, site visits, bookings, Voice IQ deliveries, and platform support tickets.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** New script `scripts/demo/seed.ts` runnable via `npm run demo:seed`. Reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env (same pattern as existing migrations).
- [ ] **AC-2** Idempotent — re-running doesn't duplicate. Keys off a fixed slug (`skyline-realty-demo`) for the org and stable seed-derived UUIDs.
- [ ] **AC-3** Creates 1 org with full RERA + GSTIN populated (visible on cockpit + platform list via D-220).
- [ ] **AC-4** Creates 1 default workspace.
- [ ] **AC-5** Creates 1 property with ~30 units across statuses (available / held / booked / sold) — populates D-223 catalog browser.
- [ ] **AC-6** Creates 20 leads at varied lifecycle states.
- [ ] **AC-7** Creates 5 deals across the booking-pipeline stages so D-224 widget shows real numbers.
- [ ] **AC-8** Creates 7 site visits spread across the next 7 days (dates relative to "now") so D-222 calendar shows tinted cells.
- [ ] **AC-9** Creates 3 Voice IQ delivery log entries (event_inbox_log rows with source_product='voice_iq') so D-132 admin page shows a populated table.
- [ ] **AC-10** Creates 3 platform support tickets in varied states.
- [ ] **AC-11** Console output prints a summary: org id, slug, what was created, what was skipped (already-existed rows). Final line: "Demo org ready · /platform/organizations/<id>".

## Tests

- [ ] **AC-12** Unit tests for the seeder helpers (UUID derivation, idempotent insert helper). Live-DB integration is out-of-scope for unit tests; we test the deterministic-id + idempotency logic in isolation.
- [ ] **AC-13** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Multi-org seeding — V3 (one demo org is enough).
- Realistic photo/imagery upload — V3.
- Time-shifting leads to look "fresh" on every demo run — V3 (`scheduled_at` for site visits IS time-shifted to next 7 days; lead `created_at` is left as the script's run-time).
- Cleanup script (`demo:reset`) — V3 (operator can hard-delete the org row via `/platform/organizations/[id]` in V3).

## Stack

Plain TypeScript script run via `tsx` (already a dev dep) + `@supabase/supabase-js` admin client. No new deps. Stable UUIDs via Node crypto's `randomUUID` seeded from a fixed string for idempotency.
