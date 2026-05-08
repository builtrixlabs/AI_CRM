# Spec — 013-call-audit-event-bus

The CRM's inbound event surface, scoped to V0's Call Audit
contract: `call.audited` + `call.objection_detected`.

## Functional surface

- `POST /api/events/inbox` — HMAC-signed JSON body with
  `BuiltrixEvent` envelope `{event_id, organization_id, event_kind,
  ts, payload}`.
- `dispatchInboxEvent(envelope, deps?)` — top-level dispatcher.
- `onCallAudited(payload, deps)` / `onCallObjectionDetected(payload, deps)`.

## Non-functional

- Idempotency: by `event_id` per org. Second POST returns
  `deduped:true`.
- Cross-tenant: `lead_id` MUST exist within the event's
  `organization_id`. If not → reject before any insert.

## Out of scope

- Outbound to sister products.
- Provider-specific call_audit detail (we ingest the normalized
  envelope only).
