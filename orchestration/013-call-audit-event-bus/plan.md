# Plan — 013-call-audit-event-bus

## Files

### Migrations
- `supabase/migrations/20260508160000_event_inbox_log.sql`

### Library
- `src/lib/events/types.ts`
- `src/lib/events/inbox.ts` — `dispatchInboxEvent`, ledger writer, dedup helper
- `src/lib/events/call-audit/onCallAudited.ts`
- `src/lib/events/call-audit/onCallObjectionDetected.ts`
- `src/lib/events/index.ts`

### App route
- `src/app/api/events/inbox/route.ts`

### Tests
- `tests/lib/events/inbox.test.ts`
- `tests/lib/events/call-audit/handlers.test.ts`

## TDD order
1. Migration.
2. Types + envelope schema.
3. Dedup helper + ledger writer.
4. Call audit handlers + tests.
5. Dispatcher + tests.
6. Route + tests.
