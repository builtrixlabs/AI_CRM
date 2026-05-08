# Tasks — 010-whatsapp-inbound-and-activity-stream

Group A — schema
- [ ] A1. Migration: `whatsapp_inbound_log` (cols, indexes, append-only triggers, RLS)
- [ ] A2. Migration: `org_whatsapp_endpoints` (per-org webhook secret + RLS)
- [ ] A3. Migration: `ensure_workspace_inbox_lead(workspace_id)` SQL function

Group B — webhook library (TDD)
- [ ] B1. RED: `verifyWhatsAppSignature` — HMAC mismatch / malformed header / happy path
- [ ] B2. GREEN: implement `verifyWhatsAppSignature` with `crypto.timingSafeEqual`
- [ ] B3. RED: ingest helper — phone-found path; activity + edge + audit row shape
- [ ] B4. RED: ingest helper — phone-missing path; orphan inbox node
- [ ] B5. RED: ingest helper — dedup on `wa_message_id`
- [ ] B6. RED: ingest helper — `recordIngestion` always logs (success + failure)
- [ ] B7. GREEN: implement `upsertActivityFromWhatsApp` + `recordIngestion`
- [ ] B8. REFACTOR: extract phone normalization (E.164-ish) into a small util

Group C — route handler (TDD)
- [ ] C1. RED: 401 on signature mismatch; no DB writes
- [ ] C2. RED: 400 on malformed JSON
- [ ] C3. RED: 400 on missing `wa_message_id`
- [ ] C4. RED: 200 on happy path; deduped path; orphan path
- [ ] C5. GREEN: implement `route.ts` with explicit org_id resolution

Group D — integration + memory
- [ ] D1. Integration test: webhook → activity row visible to canvas SELECT
- [ ] D2. Append decisions to `memory/decisions.md`
- [ ] D3. Update `memory/learned/ai-crm/patterns.md` with the dedup + signature patterns
- [ ] D4. Verify Vitest run passes locally; coverage ≥ 80%/90%
