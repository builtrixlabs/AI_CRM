# Directive 130 — Event inbox v2 (Voice IQ payload extension)

**Kind:** feature (V2 / Phase A)
**Status:** AUTHORIZED — operator pre-approved (2026-05-09 batch: D-130..D-225)
**Created:** 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-130
**Authority:** Constitution II (tenant isolation), III (provenance), IV (audit)
**Builds on:** D-013 (call-audit event bus), D-019 (per-org agent config)

---

## Problem

Voice IQ now produces enriched call analyses — BANT, intent capture score, competitor mentions, multi-objection arrays, compliance flags, next-best-action. Today our `call.audited` handler only consumes a v1 payload (lead_id, workspace_id, duration, summary, recording_url, direction). v2 payload is additive — we add fields, never remove — and the handler must lift selected fields up to the lead so the canvas reflects them without a fresh agent run.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Add `"voice_iq"` to `envelopeSchema.source_product` enum (additive — `call_audit` still works).
- [ ] **AC-2** Extend `callAuditedPayloadSchema` with all v2 fields **optional**: `bant`, `intent`, `scoring`, `competitors_mentioned`, `objections[]`, `compliance.flags[]`, `next_best_action`, `schema_version: "v2"`.
- [ ] **AC-3** v1 payloads (no v2 fields) continue to flow through unchanged — backward-compatible.
- [ ] **AC-4** v2 fields land in the call node under `data.custom.{bant|intent|scoring|competitors_mentioned|objections|compliance|next_best_action|schema_version}` (call schema is `.strict()`, so root keys stay v1).
- [ ] **AC-5** **BANT lift to lead**: when payload.bant present, write `lead.data.custom.bant.ai = { ...payload.bant, observed_at: envelope.ts }` (most-recent-wins). Other lead.data.custom keys preserved.
- [ ] **AC-6** **Competitors union-merge**: when payload.competitors_mentioned present, union into `lead.data.custom.competitors` (string array, deduplicated, case-insensitive).
- [ ] **AC-7** **Intent signal**: when payload.intent.intent_capture_score present (0–1), insert one `node_signals` row: `signal_type='intent'`, `signal_value=intent_capture_score`, `created_via='call_audit'`, `ai_confidence=intent.ai_confidence ?? null`, `source_event_id=envelope.event_id`.
- [ ] **AC-8** **Per-objection DOE dispatch**: when payload.objections[] non-empty, for each item dispatch `call.objection_detected` via `dispatchDirective` (one trigger per objection, distinct `trigger_id`).
- [ ] **AC-9** **Compliance HIGH audit**: when any `compliance.flags[].severity === "high"`, write a supplementary `audit_log` row (`action='call_compliance_flag_high'`) — actual cross-handler dispatch lands in D-131.
- [ ] **AC-10** Idempotency: re-POST with same `event_id` returns `deduped:true` (existing inbox dedupe path unchanged).
- [ ] **AC-11** Cross-tenant guard: if `payload.lead_id` is not in `envelope.organization_id`, return `rejected: lead not found`.

## Tests

- [ ] **AC-12** All existing `tests/lib/events/handlers.test.ts` cases still pass (v1 backward compat).
- [ ] **AC-13** New: v2 BANT lift writes lead.data.custom.bant.ai with observed_at.
- [ ] **AC-14** New: v2 competitors union dedupes case-insensitive across calls.
- [ ] **AC-15** New: v2 intent signal inserts one node_signals row.
- [ ] **AC-16** New: v2 objections[] dispatches one DOE per item.
- [ ] **AC-17** New: v2 compliance HIGH severity emits supplementary audit row.
- [ ] **AC-18** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- New event_kinds dispatcher entries (`call.bant_extracted`, `lead.intent_changed`, `call.compliance_flag`, `call.next_best_action`) — that's D-131.
- Voice IQ producer service (`builtrix.service.js`) — Voice IQ team owns; we consume.
- HMAC signature verification on the inbox route — D-132 wires the secret rotation UI; route-level HMAC check lands when D-132 ships.
- `/admin/integrations/voice-iq` UI — D-132.
- Lookup endpoint for lead resolution by phone — D-134.

## Stack

Next.js 16 + zod schemas + Supabase service-role + Constitution III provenance + DOE runtime (`dispatchDirective`).
