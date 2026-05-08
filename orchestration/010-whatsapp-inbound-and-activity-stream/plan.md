# Plan — 010-whatsapp-inbound-and-activity-stream

## Files to be created

### Migrations

| File | Lines (~) | Purpose |
|---|---|---|
| `supabase/migrations/20260508130100_whatsapp_inbound_log.sql` | 80 | append-only ledger + unique index on wa_message_id + RLS for org_admin |
| `supabase/migrations/20260508130200_org_whatsapp_endpoints.sql` | 70 | per-org webhook secret store; super_admin/org_admin scoped |
| `supabase/migrations/20260508130300_workspace_inbox_helper.sql` | 50 | SQL function `ensure_workspace_inbox_lead(workspace_id)` returning the inbox lead id |

### Library — webhook handler

| File | Lines (~) | Purpose |
|---|---|---|
| `src/lib/webhooks/whatsapp/types.ts` | 45 | `WhatsAppInboundPayload`, `IngestResult`, error variants |
| `src/lib/webhooks/whatsapp/signature.ts` | 35 | `verifyWhatsAppSignature(raw, header, secret)` HMAC-SHA256 |
| `src/lib/webhooks/whatsapp/ingest.ts` | 220 | `upsertActivityFromWhatsApp(payload, deps?)` — phone lookup, dedup, edge, audit |
| `src/lib/webhooks/whatsapp/log.ts` | 40 | `recordIngestion(...)` writes to `whatsapp_inbound_log` |
| `src/lib/webhooks/whatsapp/index.ts` | 12 | re-exports |

### App route

| File | Lines (~) | Purpose |
|---|---|---|
| `src/app/api/webhooks/whatsapp/route.ts` | 95 | edge runtime POST handler — verify signature, parse, dispatch to `upsertActivityFromWhatsApp` |

### Tests

| File | Lines (~) | Purpose |
|---|---|---|
| `tests/lib/webhooks/whatsapp/signature.test.ts` | 60 | constant-time compare; malformed header; mismatch; happy path |
| `tests/lib/webhooks/whatsapp/ingest.test.ts` | 280 | dedup, orphan inbox, lead-match, audit row shape, PII-mask |
| `tests/app/api/webhooks/whatsapp/route.test.ts` | 130 | 200 ok, 401 sig fail, 400 bad json, 400 missing wa_message_id |
| `tests/integration/whatsapp-inbound-end-to-end.test.ts` | 160 | webhook payload → DB row → canvas SELECT picks up the activity |

## TDD approach

For each library file: RED test (assert behavior), GREEN minimal impl,
REFACTOR. The route handler tests use `next/server` `NextRequest`
construction directly; no need to spin up the full Next runtime.

## Implementation order

1. **Migrations** — schema first; everything else depends on it.
2. **Signature helper** — pure function, easiest to test.
3. **Ingest helper** — the workhorse; mock supabase client in unit
   tests, hit the live DB in the integration test.
4. **Route handler** — wires the two together.
5. **Integration test** — last; needs all of the above.

## Coverage targets

- Lines ≥ 80%, branches ≥ 90% per V5 D-06.
- The route handler's 4xx branches (signature, JSON, missing fields,
  bad org_id query) are explicitly tested.

## Risks

- **Realtime publication** — already enabled on `nodes` in D-006.
  We do NOT need to publish `edges` because the canvas subscribes
  to `nodes` only and the `<ActivityRow>` has all info it needs from
  the activity row itself.
- **Inbox node provenance** — the system-created inbox lead has
  `created_by='00000000-0000-0000-0000-000000000000'` (the system
  uuid pattern from D-001), `created_via='system'`. Constitution
  III honored.
- **Signature timing attack** — uses `crypto.timingSafeEqual` on
  equal-length buffers; we always compute the digest even on
  malformed headers to keep the timing flat.
