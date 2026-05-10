# Runbook — D-311 webhook delivery worker

**One-time setup** when promoting D-311 to a deployable environment.

---

## 1. Apply the migration

```sh
npx supabase link --project-ref bwumqahgwobwghlmzcrl   # one-time
npx supabase db push                                    # applies 20260510120300_webhook_delivery_real.sql
```

Migration extends D-208's stub schema with real-delivery fields:
- `webhook_endpoints` adds: `disabled_at`, `consecutive_failures`.
- `webhook_deliveries` adds: `payload`, `status`, `attempt_number`, `next_retry_at`, `error_message`, `delivered_at`. Existing `status_code` becomes nullable (pending rows have no code yet).
- New partial index `webhook_deliveries_pending_idx` for the worker's poll query.

Existing data: any v2 stub rows with `status` not set default to `'pending'` — they'd get re-attempted by the new worker. To prevent that, run once after migration:

```sql
UPDATE public.webhook_deliveries
   SET status = 'delivered', delivered_at = ts
 WHERE status = 'pending' AND status_code = 200;
```

(Mark v2-stub rows as already delivered.)

## 2. Confirm Inngest is wired

The worker function `webhooks-deliver` is registered in [src/app/api/inngest/route.ts](../../src/app/api/inngest/route.ts). Nothing additional to do here — it'll show up in your Inngest dashboard the next time the app boots.

Inngest cron runs every minute. First run after deploy:
1. Vercel logs → look for `[inngest] webhooks-deliver completed` lines.
2. Inngest dashboard → **Functions** → `webhooks-deliver` → check the run history.

## 3. Smoke test the full loop

Pre-req: an authenticated org_admin in a test org.

### 3.1 Use webhook.site as a fake customer endpoint

1. Go to [https://webhook.site](https://webhook.site) → copy the unique URL it gives you.
2. In your app: `/admin/webhooks` → **"Add endpoint"** → URL = the webhook.site URL, Name = "Smoke", Events = `lead.created`, generate a secret.
3. Click **"Send test"** on the new endpoint.
4. Within ~60s, webhook.site receives the POST. Verify:
   - Headers include `x-builtrix-signature: sha256=...`, `x-builtrix-event-kind: test.ping`, `x-builtrix-attempt: 1`.
   - Body is JSON: `{event_id, event_kind, organization_id, attempt, ts, data}`.
5. App's `/admin/webhooks` delivery log row updates to `status=delivered, status_code=200, latency_ms=...`.
6. Verify signature against your endpoint's secret using [src/lib/webhooks/signing.ts](../../src/lib/webhooks/signing.ts) `verifySignature` helper.

### 3.2 Retry behaviour

1. webhook.site → **Inspect any request** → **Customize action** → set HTTP code `503`.
2. Click **"Send test"**.
3. Initial delivery 503 → row stays `pending`, `attempt_number=2`, `next_retry_at = now + 1m`.
4. Wait 60s; second attempt fires. Row `attempt_number=3, next_retry_at = +5m`.
5. Set webhook.site response back to `200`. Wait for the next attempt → row flips to `delivered`.
6. Verify endpoint's `consecutive_failures` reset to 0 in DB.

### 3.3 Auto-disable

1. Set webhook.site to `503` permanently.
2. Send 10 consecutive test deliveries (or wait for retries to exhaust on a single one).
3. Verify endpoint:
   ```sql
   select disabled_at, consecutive_failures
   from webhook_endpoints
   where id = '<ep-uuid>';
   -- Expect: disabled_at NOT NULL, consecutive_failures = 10
   ```
4. Subsequent "Send test" → delivery row is created but immediately marked `dead` with `error_message='endpoint_disabled'` (no HTTP fired).
5. Click **"Re-enable"** → `disabled_at = null`, `consecutive_failures = 0`. Test deliveries resume.

### 3.4 4xx classification (no retry)

1. Set webhook.site to return `404`.
2. Send test → row immediately marked `failed` (NOT `pending`/retry).
3. `consecutive_failures` increments by 1, but no retry scheduled.

### 3.5 Resend

1. On the delivery log, click **"Resend"** on any past row.
2. A NEW row is inserted with `status=pending, attempt_number=1`. Original row untouched.
3. Worker picks up within 60s, fires fresh attempt.

## 4. Audit-log query

```sql
select action, created_at, diff
from audit_log
where action like 'webhook_%'
order by created_at desc limit 20;
```

Expect rows for `webhook_endpoint_created`, `webhook_test_delivery_enqueued`, `webhook_delivery_resent`, `webhook_endpoint_reenabled`.

## 5. Rate considerations

The worker pulls up to **50 deliveries per minute** by design. If a deploy generates a burst > 50/min, deliveries queue with `next_retry_at` in the past — they'll get processed in subsequent runs (oldest first by `next_retry_at`). No backpressure / dead-letter — that's V3.x.

Per-endpoint rate-limit (to protect the customer): not enforced. If a customer's URL can't keep up, our `5s` timeout fires and the delivery retries — combined with auto-disable at 10 consecutive failures, this is self-limiting.

## 6. Rollback

D-311 is **safely rollback-able**:

1. Revert the deploy on Vercel.
2. Inngest stops invoking the worker (cron requires the function to be registered).
3. `webhook_deliveries` rows in `pending` state will sit there forever until either D-311+ re-deploys (and they fire) or you manually `UPDATE ... SET status='dead'`.
4. Schema is additive; no down-migration needed.

To explicitly drop the new columns:

```sql
DROP INDEX IF EXISTS public.webhook_deliveries_pending_idx;
ALTER TABLE public.webhook_deliveries
  DROP COLUMN IF EXISTS payload,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS attempt_number,
  DROP COLUMN IF EXISTS next_retry_at,
  DROP COLUMN IF EXISTS error_message,
  DROP COLUMN IF EXISTS delivered_at;
ALTER TABLE public.webhook_deliveries
  ALTER COLUMN status_code SET NOT NULL;   -- only if all rows have it
ALTER TABLE public.webhook_endpoints
  DROP COLUMN IF EXISTS disabled_at,
  DROP COLUMN IF EXISTS consecutive_failures;
```

But this is rarely necessary — additive schema is forward-safe.

## 7. Operator follow-ups (post-merge)

- [ ] `npx supabase db push` to apply the migration to AI CRM Supabase prod.
- [ ] (Optional) Mark legacy stub rows as delivered — see Step 1.
- [ ] Smoke test end-to-end per Step 3 against a webhook.site URL.
- [ ] Emit-on-event wiring: actually emit `lead.created` from `createLead`, etc. — currently nothing in the codebase calls `enqueueDelivery` outside the test button. **V3.x will wire emits into the existing event-emit hooks**; for v3 MVP, customers can register endpoints + receive test pings, but no real events fire yet. Document this for early-access customers.

## 8. Known gaps (V3.x)

- **No emit-on-event wiring** — the worker can deliver, but nothing in the app currently calls `enqueueDelivery` outside the test path. V3.x adds emits at `createLead`, `transitionLead`, `bookSiteVisit`, etc.
- **No per-event-kind subscription enforcement** — `webhook_endpoints.events_subscribed` is set at registration but the (V3.x) emit code will need to filter by it.
- **No retry-queue UI** — pending deliveries with future `next_retry_at` aren't surfaced as "queued". V3.x adds a row badge.
- **No endpoint-health metrics** — success rate %, p95 latency, etc. V3.x.
- **No webhook-portal-style replay across all endpoints** for a single event_id — V3.x.
- **Rate-limit per endpoint URL** — V3.x.

## 9. References

- Spec: [directives/311-webhook-delivery-worker.md](../../directives/311-webhook-delivery-worker.md)
- Plan: [docs/plans/v3-plan-v1.md](../plans/v3-plan-v1.md) §4 D-311
- Library: [src/lib/webhooks/{signing,retry,deliver,worker}.ts](../../src/lib/webhooks)
- Inngest function: [src/lib/inngest/functions/webhooks-deliver.ts](../../src/lib/inngest/functions/webhooks-deliver.ts)
- Migration: [supabase/migrations/20260510120300_webhook_delivery_real.sql](../../supabase/migrations/20260510120300_webhook_delivery_real.sql)
- Companion: D-208 admin UI ([src/app/(admin)/admin/webhooks](../../src/app/(admin)/admin/webhooks))
