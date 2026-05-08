# Directive 013 — Call Audit event bus integration

**Kind:** feature
**Status:** AUTHORIZED — Plan Mode (Gate 2) approved (operator: assume-approve)
**Created:** 2026-05-08
**Source:** docs/install-plan.md §4 D-013 + docs/PRD.md §6 sister-product integration + Constitution III provenance + Constitution V DOE
**Authority:** memory/constitution.md (Principles II tenant isolation, III provenance + source_event_id, IV audit, V DOE)
**Builds on:** D-001..D-002 (auth + nodes), D-009 (gateway+agents), D-010 (webhook patterns), D-011 (DOE engine)
**Stack:** branched off `v1` directly.

---

## Problem

Builtrix Call Audit is the sister product that audits sales calls
and produces structured summaries + objection detection. Per
PRD §6 the integration is **event-bus based**, not direct DB
joins. The CRM consumes:

- `call.audited` — call complete, summary + duration ready.
- `call.objection_detected` — model flagged an objection
  (e.g. "price"). Triggers DOE D-09 (surface playbook).

Today there is no `/api/events/inbox` endpoint, no inbound
event-shape contract, no idempotency by `event_id`, and no path
that emits the DOE `call.objection_detected` trigger.

D-013 closes those gaps:

1. **`/api/events/inbox`** — POST endpoint accepting a
   `BuiltrixEvent` envelope. Idempotent by `event_id` (a uuid
   issued by the source product). HMAC-SHA256-signed via the
   D-010 verify pattern.
2. **Inbox dispatcher** (`src/lib/events/inbox.ts`) — a tiny
   discriminator over `event_kind` that routes to per-kind
   handlers.
3. **Call Audit handlers** (`src/lib/events/call-audit/*`):
   - `onCallAudited(payload)` — creates a `call` node attached
     to the lead/deal via `mentioned_in` edge, summary + duration
     stored on `data`.
   - `onCallObjectionDetected(payload)` — creates the call node
     (or re-uses an existing one keyed by `event_id`), then
     emits a DOE `call.objection_detected` trigger (D-09 fires).
4. **`event_inbox_log`** — append-only ledger like
   `whatsapp_inbound_log`. One row per POST, regardless of outcome.
5. **Idempotency** — `nodes.data.custom.source_event_id =
   <event_id>` keyed lookup on the `call` node. Second call with
   the same id returns deduped.
6. **Tests** + **integration tests**.

---

## Success criteria

- [ ] **AC-1** `POST /api/events/inbox` validates HMAC + body
      shape, returns `{ok, deduped, ...}` (200) or 4xx.
- [ ] **AC-2** Idempotent on `event_id` per org — second POST
      returns `deduped: true`, no node insert.
- [ ] **AC-3** `call.audited` creates a `call` node with
      `data.duration_seconds`, `data.summary`, edge
      `mentioned_in` → lead.
- [ ] **AC-4** `call.objection_detected` creates the call node
      AND dispatches the DOE runtime with
      `trigger.kind='call.objection_detected'` and
      `payload.objection`. D-09's seed condition matches when
      `objection='price'`.
- [ ] **AC-5** `event_inbox_log` rows for every POST (success,
      deduped, rejected).
- [ ] **AC-6** Audit log row on successful insert with
      `actor_role='call_audit_event'`, `action='event_inbound'`.
- [ ] **AC-7** Cross-tenant `lead_id` returns "lead not found"
      shape — never inserts.
- [ ] **AC-8** Coverage 80/90 on `src/lib/events/**`.

---

## Non-goals

- Outbound CRM → other products. The CRM emits Inngest events
  internally (`lead.created`); cross-product outbound is the
  sister product's responsibility (subscribe to our DB stream,
  or we add a webhook publisher in V1).
- Real Call Audit instance — V0 ships the receiver only; the
  emitter is the Call Audit team's repo.
- Call recording storage. The PRD names Supabase Storage with
  signed URLs; we accept `recording_url` as a string and store it
  on `data.recording_url` without validating the storage backend.
