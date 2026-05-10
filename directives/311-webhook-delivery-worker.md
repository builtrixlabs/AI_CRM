# Directive 311 — Webhook delivery worker

**Kind:** feature (V3 / Phase B — billing + delivery + observability)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Generated:** 2026-05-10
**Branch target:** `v3` (carried in PR [apps#42](https://github.com/builtrixlabs/AI_CRM/pull/42))
**Source:** `docs/plans/v3-plan-v1.md` §4 D-311
**Builds on:** D-208 (`webhook_endpoints` + `webhook_deliveries` v2 stub), D-013 (`/api/events/inbox` HMAC pattern)

---

## Problem

v2's D-208 ships the **shape** of outbound webhook delivery — registration UI, secrets, delivery log table, "Send test" button — but the actual delivery is a stub: `sendTestDelivery` writes a `webhook_deliveries` row with `status_code=200` and a hardcoded `response_preview`. No HTTP is fired.

D-311 lands the real worker:

- **Inngest function** `webhooks.deliver` runs every minute, picks up `webhook_deliveries.status='pending' AND next_retry_at <= now()`, signs the body with the endpoint's secret, POSTs with a 5s timeout.
- **Retry policy** — exponential backoff at 1m / 5m / 30m / 2h / 12h (5 attempts total). 4xx responses don't retry; 5xx + network errors do.
- **Auto-disable** — endpoint flips `disabled_at = now()` after **10 consecutive failed deliveries**; org-admin must explicitly re-enable.
- **"Resend" button** — org-admin can re-fire any past delivery; creates a fresh `pending` row (doesn't mutate the original).
- **Signature header** `x-builtrix-signature: sha256=<hex>` over the raw JSON body.

The v2 schema needs extension: `webhook_deliveries` only has `status_code` (no payload, no status, no attempt counter, no retry timestamp); `webhook_endpoints` has no `disabled_at` or consecutive-failure tracker.

## Success criteria (production target 80/90)

### Schema (additive)

- [ ] **AC-1** Migration `<ts>_webhook_delivery_real.sql`:
  - `webhook_endpoints` adds: `disabled_at timestamptz`, `consecutive_failures int NOT NULL DEFAULT 0`.
  - `webhook_deliveries` adds: `payload jsonb NOT NULL DEFAULT '{}'::jsonb`, `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','dead'))`, `attempt_number int NOT NULL DEFAULT 1`, `next_retry_at timestamptz`, `error_message text`, `delivered_at timestamptz`. The existing `status_code int NOT NULL` becomes nullable (the 'pending' state has no code yet) — DEFAULT 0.
  - Index: `(status, next_retry_at)` partial WHERE status='pending' for the worker's poll query.
  - The v2 stub's INSERT (200/synthetic) keeps working — it sets status='delivered' explicitly for back-compat.

### Signing primitive

- [ ] **AC-2** New module `src/lib/webhooks/signing.ts`:
  - `signPayload(secret, body)` → `sha256=<hex>` matching the `/api/events/inbox` D-010 pattern.
  - `verifySignature(secret, body, header)` → `boolean` (timing-safe). Used by tests + by any inbound endpoint that wants to verify our outbound signature.
  - Pure, no I/O. Same algorithm as the WhatsApp inbound HMAC — proven pattern.

### Delivery primitive

- [ ] **AC-3** New module `src/lib/webhooks/deliver.ts`:
  - `enqueueDelivery({ endpoint_id, organization_id, event_kind, payload })` — INSERTs a `pending` row, sets `next_retry_at = now()`. Used by future event-emit code AND by `sendTestDelivery` (replaces the v2 stub).
  - `attemptDelivery(delivery_row, endpoint_row, fetchImpl?)` — performs ONE POST: signs, fetches with 5s timeout, classifies response. Returns `{ outcome: 'delivered' | 'retry' | 'dead', latency_ms, status_code, error_message?, response_body? }`. Pure-ish (DB writes are the caller's responsibility — keeps the worker's transaction shape clean).
  - Classification: 2xx → delivered. 4xx (except 408/429) → dead (no retry). 5xx / 408 / 429 / network error / timeout → retry until attempt 5 → then dead.
  - Response body truncated to 4KB before storage.

- [ ] **AC-4** New module `src/lib/webhooks/retry.ts`:
  - `nextRetryAt(attempt_number, now)` — returns next retry timestamp or `null` if max attempts exhausted. Schedule: 1, 5, 30, 120, 720 min. Pure function.

### Inngest worker

- [ ] **AC-5** New Inngest function `src/lib/inngest/functions/webhooks-deliver.ts`:
  - `cron: '* * * * *'` (every minute).
  - Picks up to 50 pending deliveries per run via `SELECT * FROM webhook_deliveries WHERE status='pending' AND next_retry_at <= now() ORDER BY next_retry_at LIMIT 50`.
  - For each: load endpoint, skip if `disabled_at IS NOT NULL`, call `attemptDelivery`, UPDATE the delivery row + endpoint counters in a single transaction-ish sequence. On `outcome='delivered'`: status='delivered', delivered_at=now, endpoint.consecutive_failures=0. On `outcome='retry'`: status stays 'pending', attempt_number++, next_retry_at=nextRetryAt(...), endpoint.consecutive_failures++. On `outcome='dead'`: status='failed' or 'dead', endpoint.consecutive_failures++.
  - Auto-disable: if `endpoint.consecutive_failures` reaches 10, UPDATE `disabled_at=now`.
  - Returns summary: `{ scanned: N, delivered: N, retried: N, dead: N, disabled: N }`.

### UI surface

- [ ] **AC-6** `/admin/webhooks` adjustments:
  - Each delivery row shows: status (pending / delivered / failed / dead), attempt count, latency, response-preview (existing).
  - "Resend" button on each row → server action `resendDeliveryAction(delivery_id)` — INSERTs a new `pending` row with `attempt_number=1` and the same `payload`. Audit-logged.
  - Endpoints with `disabled_at IS NOT NULL` show a red badge "Auto-disabled" + a "Re-enable" button (clears `disabled_at` and zeros `consecutive_failures`).
  - **Out of scope**: rewriting the existing `webhook-list.tsx` shape. Just additive — new badges, new buttons.

- [ ] **AC-7** "Send test" path (`sendTestDelivery`) refactored: instead of writing `status_code=200` directly, it now `enqueueDelivery({ event_kind: 'test.ping', payload: { ... } })` so the **real** worker delivers (or fails) the test. Visible in the delivery log within ~60s.

### Tests (TDD)

- [ ] **AC-8** `tests/lib/webhooks/signing.test.ts` — sign/verify roundtrip, tamper detection, timing-safe length-mismatch handling.
- [ ] **AC-9** `tests/lib/webhooks/retry.test.ts` — schedule produces 1, 5, 30, 120, 720 min; attempt 6 returns null.
- [ ] **AC-10** `tests/lib/webhooks/deliver.test.ts` — `attemptDelivery` classifies 200/204 as delivered, 400/404 as dead, 500/502/timeout as retry. Mocked fetch.
- [ ] **AC-11** `tests/lib/inngest/webhooks-deliver.test.ts` — worker run with mocked DB:
  - Delivery succeeds → row marked delivered, endpoint counter reset.
  - Delivery 5xx → retry scheduled, attempt_number++.
  - 10th consecutive failure → endpoint.disabled_at set.
  - Skips disabled endpoints.
- [ ] **AC-12** `tests/app/admin/webhooks/actions.test.ts` extends with `resendDeliveryAction` case.
- [ ] **AC-13** Coverage on touched files: ≥80% lines / ≥90% branches.
- [ ] **AC-14** Gate-4 security scan: 0 CRITICAL/HIGH.

## Non-goals (deferred to V3.x)

- **Retry queue UI** (showing pending deliveries with next-retry timer) — table columns are there, surfacing the live timer is V3.x.
- **Per-event-kind subscription filtering enforcement** — `webhook_endpoints.events_subscribed` is a JSON array but D-311 doesn't yet emit deliveries from anywhere; the actual emit-on-event wiring (e.g. emit `lead.created` on `createLead`) is V3.x.
- **Endpoint-health metrics dashboard** (delivery success rate %, avg latency) — V3.x.
- **Webhook-portal-style replay tool** for org-admins to inspect a specific event's delivery history across all endpoints — V3.x.
- **Stripe Webhooks-style "send test event" with arbitrary event_kind picker** — `sendTestDelivery` only fires `test.ping` for v3 MVP.
- **Rate-limit per endpoint URL** to protect customer infrastructure — V3.x.

## Stack

- **No new runtime deps.** Reuses Node `crypto` for HMAC, `fetch` for HTTP, existing Inngest client.
- **Inngest cron**: `* * * * *` (every minute) — same shape as D-012's site-visit sweep.
- **HTTP timeout**: 5000ms via `AbortSignal.timeout(5000)`.

## Learned patterns applied

- **`hmac-flat-timing-verification`** (D-010) — sign uses HMAC-SHA256, timing-safe compare. Same primitive across inbound and outbound.
- **`cron-window-sweep-with-doe-idempotency`** (D-012) — every-minute cron + per-row idempotency via the row's own state (status='pending' + next_retry_at).
- **`inngest-job-stub-deferred`** (D-002) — what D-208 was; D-311 lands the real body.
- **`server-action-result-discriminated-union`** — `resendDeliveryAction` matches existing shape.

## Authority

- Constitution V — **Bounded Authority** (outbound webhooks are part of the data-egress boundary).
- Supersedes: D-208 § AC-9 ("**Real outbound HTTP delivery is V3** — v2 ships a stub").

## Operator follow-ups (post-merge)

- [ ] Apply migration to AI CRM Supabase prod.
- [ ] Confirm Inngest is wired (env: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` already present).
- [ ] Smoke test "Send test" → expect a real HTTP POST visible at the configured webhook URL (use https://webhook.site for first dry-run).
- [ ] Watch first 24h for unexpected `disabled_at` flips on legitimate endpoints (would indicate a bug or genuinely flaky customer URL).
