# Directive 202 — `/admin/system-health`

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-202

---

## Problem

Org admins want one place to see "is anything wrong" — failed background jobs, integration health, recent error events.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Library `src/lib/admin/system-health.ts`: `getSystemHealth(org_id)` returns:
  - failed_directive_invocations_7d (count + 5 most recent)
  - inbox_failures_7d (event_inbox_log status='error' count)
  - voice_iq_configured (boolean from org_integration_secrets)
  - whatsapp_configured (boolean — look for org row in org_whatsapp_endpoints if present, else false)
  - email_configured (boolean — placeholder; integration table TBD)
- [ ] **AC-2** Page `/admin/system-health` (Server Component, org_admin gate). Renders status cards: green when healthy, amber when degraded, rose when failing.
- [ ] **AC-3** Failed-directive list shows last 5 with directive_id, ts, error reason.
- [ ] **AC-4** Layout: /admin nav adds "System health".

## Tests

- [ ] **AC-5** Unit tests for `getSystemHealth` — empty / all-healthy / mixed.
- [ ] **AC-6** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Stack

shadcn Card / Badge + Supabase service-role.
