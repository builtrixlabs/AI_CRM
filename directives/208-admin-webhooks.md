# Directive 208 — `/admin/webhooks` outbound webhook management

**Kind:** feature (V2 / Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-208

---

## Problem

No org-admin surface for managing outbound webhooks. Demo lens — registration UI + stub delivery log; real worker lands V3.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Migration: `webhook_endpoints` (org_id, name, url, secret, events_subscribed jsonb, enabled, provenance) + `webhook_deliveries` (endpoint_id, event_kind, status_code, latency_ms, ts, response_preview).
- [ ] **AC-2** Library `src/lib/admin/webhooks.ts`: list / create / toggle-enabled / delete / send-test (writes a fake delivery row with status=200, latency≈30ms; no real HTTP).
- [ ] **AC-3** Page `/admin/webhooks` (settings:manage_integrations gate): registered endpoints table + new-endpoint form + per-endpoint delivery log (last 20 rows).
- [ ] **AC-4** Layout: /admin left-nav adds "Webhooks".

## Tests

- [ ] **AC-5** Lib tests: create + list + send-test all happy paths + audit row.
- [ ] **AC-6** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Stack

shadcn Card / Table / Input / Button + Postgres tables + Constitution III provenance.
