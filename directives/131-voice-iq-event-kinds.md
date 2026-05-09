# Directive 131 — Four new Voice IQ event_kinds + DOE seeds

**Kind:** feature (V2 / Phase A)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-131
**Authority:** Constitution II (tenant isolation), III (provenance), IV (audit), V (DOE governance)
**Builds on:** D-130 (event inbox v2 schemas), D-011 (DOE engine + directives table), D-019 (per-org agent provisioning)

---

## Problem

D-130 ships consumption of the **fat** `call.audited` v2 payload. Voice IQ also needs to push **lean follow-up events** when a single signal changes mid-flight: BANT extracted, intent score moved, compliance flag raised, next-best-action recommended. Today the inbox dispatcher rejects these with `unsupported event_kind`.

D-131 wires the four new `event_kind` routes, ships per-event handlers, and seeds four platform-default DOE directives (`D-VIQ-01..04`) so each event has a default org-pausable behaviour from day one.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Inbox dispatcher (`src/lib/events/inbox.ts`) routes four new `event_kind`s: `call.bant_extracted`, `lead.intent_changed`, `call.compliance_flag`, `call.next_best_action`.
- [ ] **AC-2** Four new handlers under `src/lib/events/call-audit/`: `onBantExtracted.ts`, `onLeadIntentChanged.ts`, `onCallComplianceFlag.ts`, `onCallNextBestAction.ts`.
- [ ] **AC-3** Each handler validates payload via Zod, resolves the lead in the caller's org, fails closed on cross-tenant.
- [ ] **AC-4** `onBantExtracted` lifts BANT to `lead.data.custom.bant.ai` (most-recent-wins, preserves manual entry).
- [ ] **AC-5** `onLeadIntentChanged` inserts `node_signals(signal_type='intent')` with event-id dedup (re-POST is a no-op).
- [ ] **AC-6** `onCallComplianceFlag` always writes an audit_log row with the flag detail; dispatches DOE only when severity is HIGH.
- [ ] **AC-7** `onCallNextBestAction` surfaces NBA on `lead.data.custom.next_best_action` (most-recent-wins).
- [ ] **AC-8** Each handler dispatches the matching DOE trigger_kind (`call.bant_extracted`, `lead.intent_changed`, `call.compliance_flag`, `call.next_best_action`), with a stable `trigger_id = "<event_kind>:<event_id>"`.
- [ ] **AC-9** New `TriggerKind` literal union in `src/lib/doe/types.ts` includes the four new kinds.
- [ ] **AC-10** New migration `supabase/migrations/2026XXXX_seed_voice_iq_directives.sql` seeds four platform-default rows: `D-VIQ-01` BANT (T1, surface_on_canvas), `D-VIQ-02` intent (T0, notify_user when ≥0.75), `D-VIQ-03` compliance (T1, notify_user severity=high), `D-VIQ-04` NBA (T0, surface_on_canvas).
- [ ] **AC-11** Cross-tenant test: event for org A targeting a lead in org B → handler returns `rejected: lead not found`. Zero side-effects in either org.
- [ ] **AC-12** Single-fire test: re-POST same event_id for `lead.intent_changed` writes only one `node_signals` row; DOE invocation idempotency picks up duplicates via existing `directive_invocations.trigger_id`.

## Tests

- [ ] **AC-13** `tests/lib/events/handlers-d131.test.ts` — one describe block per handler, covering happy path, payload validation, cross-tenant rejection, DOE dispatch, and (for intent) event-id dedup.
- [ ] **AC-14** Inbox dispatch test: each new `event_kind` routes to the correct handler.
- [ ] **AC-15** Seed migration smoke: load fixtures, assert 4 rows with correct trigger_kind values exist with `organization_id IS NULL`.
- [ ] **AC-16** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- HMAC signature verification on the inbox route (D-132).
- `/admin/integrations/voice-iq` UI (D-132).
- Lookup endpoint (D-134).
- D-VIQ-XX auto-pause UI from `/admin/directives` — D-017's existing UI already handles platform-default visibility + per-org override.
- Custom override editing UI for D-VIQ rows — same.

## Stack

Next.js 16 + zod + Supabase + DOE engine (`dispatchDirective`).
