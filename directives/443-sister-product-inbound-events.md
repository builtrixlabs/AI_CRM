# Directive 443 — Inbound event handlers from sister products

**Status:** Authored
**Date:** 2026-05-13
**Author:** Agent (Vibe OS V5)
**Branch:** `feature/443-sister-product-inbound-events` → PR target `v5`
**Plan source:** [AI_CRM-4 order of implementation v2 — Phase 2.4](../../../Downloads/AI_CRM-4-order-of-implementation-v2.md)

## 1. Problem

D-442 just shipped the producer-side contract. D-443 lands the **consumer side** — the route + handlers that accept events *from* PSCRM / lead-sources / Legal Auditor, authenticated by D-440 tokens, dispatched by the existing D-013 event dispatcher.

Inbound event kinds:
- From PSCRM: `post_sales.milestone_updated`, `post_sales.demand_letter_sent`, `post_sales.handover_completed`
- From lead-sources: `lead.ingested`
- From Legal Auditor: deferred (no immediate consumer)

## 2. Scope (in)

1. **`src/lib/events/types.ts`** — extend `source_product` enum with `post_sales_crm` + `lead_sources`. Add zod payload schemas for the 4 new event kinds.
2. **`src/lib/events/post-sales/{index,on-milestone-updated,on-demand-letter-sent,on-handover-completed}.ts`** — three handlers that validate payload + record the event. Scaffolding tier; full activity-stream wiring (writing into deal `activity_stream`) lands with the dispatcher directive.
3. **`src/lib/events/lead-sources/{index,on-lead-ingested}.ts`** — handler that validates payload + routes to the same quarantine + Lead Enrichment Agent pipeline as the D-417 webform ingestion (call existing `enqueue_quarantine_lead` flow). Scaffolding tier — D-443 just records the event log; the wired enrichment trigger lands when D-417's emit-side dispatcher is extended.
4. **`src/lib/events/inbox.ts`** — register the 4 new handler branches in `dispatchInboxEvent`. Idempotency via a new `findExistingInboxLogEvent(client, org_id, event_id)` helper that checks `event_inbox_log` (the existing call-audit dedup looked at `nodes`, which sister-product events don't create).
5. **`src/app/api/sister/events/inbox/route.ts`** — new POST route. **Bearer token (D-440)** auth via `authenticateSisterProductRequest`; resolves `org_id` + `product_kind`. Envelope's `organization_id` must match the token's `org_id` (cross-tenant fail-closed 403). Envelope's `source_product` must match the token's `product_kind` namespace. Returns 200 / 400 / 401 / 403.
6. **Tests:**
   - `tests/lib/events/post-sales/handlers.test.ts` — happy + invalid-payload paths for all 3 PSCRM handlers.
   - `tests/lib/events/lead-sources/on-lead-ingested.test.ts` — happy + invalid-payload paths.
   - `tests/app/api/sister/events/inbox.test.ts` — missing Bearer → 401, invalid Bearer → 401, org-mismatch → 403, source_product-mismatch → 403, bad envelope → 400, valid → 200; idempotent re-POST returns `deduped`.

## 3. Out of scope (deferred dispatcher work)

- Writing inbound events into deal `activity_stream` / `node_signals`. Scaffolding tier logs to `event_inbox_log` only.
- Triggering Lead Enrichment Agent on inbound `lead.ingested` (D-417's emit-side hook). Lands when the enrichment dispatcher is extended.
- Legal Auditor inbound (`legal.*` event kinds).
- Inbox replay / backfill UI for sister-product events.

## 4. Per-org integration model — locked

The Bearer token IS the org context. The route resolves `(org_id, product_kind)` from the token; the envelope must match BOTH or the request is rejected. Cross-tenant fail-closed is enforced at three layers:

1. **Auth:** D-440 token lookup binds the request to `(org_id, product_kind)`.
2. **Envelope:** `organization_id` field must equal token's `org_id`.
3. **Source:** `source_product` must align with token's `product_kind` (post_sales_crm token can only post `post_sales.*`; lead_sources can only post `lead.ingested`).

No "service token" or "global" path exists.

## 5. Acceptance (10-gate STOPPING CRITERIA)

1. **Built:** every file in §2.
2. **Tested:** new vitest green.
3. **Typechecked:** clean for changed files.
4. **Migrations:** N/A.
5. **Pushed:** PR opened against v5.
6. **Vercel preview green.**
7. **UI verified on live preview:** N/A (backend-only).
8. **PR merged to v5.**
9. **Post-merge v5 build green.**
10. **Status logged in V5_STATUS.md.**
