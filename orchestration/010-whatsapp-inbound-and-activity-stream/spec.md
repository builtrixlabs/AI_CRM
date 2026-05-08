# Spec — 010-whatsapp-inbound-and-activity-stream

## Goal

Wire WhatsApp inbound to the Activity Stream on the Lead canvas with
provenance + dedup + audit, so a sales rep sees inbound conversations
on the canvas the moment they arrive — no copy-paste, no separate
"Activities tab."

## Functional surface

### Webhook
- `POST /api/webhooks/whatsapp` — JSON body, HMAC-signed, idempotent
  by `wa_message_id`.
- Returns `{ok, deduped, activity_id?, lead_id?}` (200) or
  `{ok:false, error}` (4xx).

### Library
- `upsertActivityFromWhatsApp(payload, deps?)` — the server-side
  workhorse. Resolves the lead by phone within `organization_id`,
  creates the activity node + edge, writes audit row, and returns
  the dedup-aware result.
- `verifyWhatsAppSignature(rawBody, header, secret)` — HMAC-SHA256
  helper.

### Database
- `whatsapp_inbound_log` — append-only ledger.
- Index on `wa_message_id` for dedup lookup.

### Canvas integration
- The existing `<ActivityStream>` (D-006) picks up new rows via the
  realtime publication on `nodes` (enabled in D-006). No component
  changes needed beyond a one-line type expansion if the activity's
  `data.kind` was previously enumerated narrowly (it wasn't — see
  `src/lib/nodes/schemas/activity.ts` already includes `whatsapp`).

## Non-functional

- p95 webhook → DB-write latency < 250ms locally.
- PII-mask compliance verified by `maskPii(body).includes('[phone]')`
  / `[email]` style assertions in unit tests.
- Idempotency under concurrent retries: second insert with the same
  `wa_message_id` raises a unique-violation we catch and convert to
  `deduped: true`.

## Open questions (resolved here)

- **Q:** Default behaviour when phone has no lead?
  **A:** Orphan into a per-workspace system `inbox` lead (a real
  `node` row of `node_type='lead'` with `state='inbox'`, label
  `"WhatsApp Inbox"`, created lazily). Reps can move messages off
  the inbox via the existing edit-mode UI later.
- **Q:** Dedup window?
  **A:** No window — `UNIQUE(wa_message_id)` constraint forever.
  The provider's `wa_message_id` namespace is permanent.

## Out of scope

- Outbound message send.
- Template approval flows.
- Media handling (image, voice, location).
- Multi-org provider routing UI (D-016 parked).
