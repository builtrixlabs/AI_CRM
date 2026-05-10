# Runbook — D-301 deploy checklist (multi-instance rate-limit on Vercel KV)

**One-time setup** when promoting D-301 (`v3` series) to a deployable environment. Steps build on the v3 deploy state already established by D-300.

---

## 1. Provision Vercel KV (Upstash Redis)

1. Vercel dashboard → **Storage** → **Create** → **KV**.
2. Pick a region close to your Vercel deployment region (Mumbai for AI CRM if production runs there).
3. Plan: `Free` is fine for v3 MVP — D-301 hits at most ~tens of `EVAL` per second under normal traffic.
4. Connect the KV instance to the AI CRM Vercel project. Vercel will offer to inject env vars; **accept**.

Vercel will populate three env vars; D-301 only needs two:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

(`KV_REST_API_READ_ONLY_TOKEN` exists for readonly clients and isn't used by D-301.)

## 2. Verify the env

After Vercel injects the vars, redeploy `v3` Preview and Production. On the next request that hits a rate-limited surface, look for either:

- **No log line** = `KvLimiter` is in use (success).
- `[rate-limit] KV outage, failing open: ...` = `KvLimiter` instantiated but the call timed out / errored. Check Vercel KV dashboard for connectivity issues.
- `[rate-limit] NODE_ENV=production but KV_REST_API_URL / KV_REST_API_TOKEN missing.` = `MemoryLimiter` is in use. Env wiring failed.

You can force the memory backend (e.g. for a CI test job that doesn't have KV) with `RATE_LIMIT_BACKEND=memory`.

## 3. Smoke test the buckets

After deploy:

```sh
# Per-IP login bucket — 5/60s. 6th hit should 429.
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://crm.builtrix.com/api/auth/rate-check \
    -H "x-forwarded-for: 198.51.100.7" \
    -H "content-type: application/json" \
    -d '{"email":"smoke@example.com"}'
done
# Expected: 200 200 200 200 200 429
```

```sh
# Per-account bucket — 20/3600s. Vary the IP per request.
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://crm.builtrix.com/api/auth/rate-check \
    -H "x-forwarded-for: 198.51.100.$i" \
    -H "content-type: application/json" \
    -d '{"email":"victim@example.com"}'
done
# Expected: 200 (x20) then 429 with axis=email
```

```sh
# Lookup bucket — 5/15min/IP on /api/admin/leads/lookup.
# Use a real Voice IQ Bearer token; rate-limit fires before bearer check.
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://crm.builtrix.com/api/admin/leads/lookup?org_id=00000000-0000-0000-0000-000000000000&external_id=x" \
    -H "x-forwarded-for: 198.51.100.42" \
    -H "authorization: Bearer fake-token"
done
# Expected: 401 401 401 401 401 (or 404), then 429.
```

## 4. Audit-log query

After triggering a denial:

```sql
select action, diff, created_at
from audit_log
where action = 'auth.rate_limited'
order by created_at desc limit 10;
```

Expect rows with `diff.axis` = `"ip"` or `"email"` and `diff.key_hint` carrying the first 64 chars of the IP / email.

## 5. Hot-path latency

In Vercel logs, every `consume()` call that takes > 100ms ought to be infrequent. There's no built-in metric for KV round-trip — V3.x adds Sentry instrumentation. For now, sample logs manually after deploy.

If KV consistently returns > 1s, the timeout fires and `KvLimiter` fails open (logged warning). Verify the KV region matches the Vercel deployment region.

## 6. Rollback

D-301 is **safe to roll back** at the code layer:

1. Revert the deploy on Vercel.
2. The previous build uses `MemoryLimiter` — single-instance correctness only, but functionally identical at the seam.
3. KV state (sorted-set keys with TTL) ages out within the longest window (1 hour for `loginAccountBucket`).
4. No DB schema changes — nothing to migrate down.

Removing `KV_REST_API_URL` / `KV_REST_API_TOKEN` from Vercel env (without rolling back code) also forces the memory backend, with the warning log on every cold start.

## 7. Operator follow-ups (post-merge)

- [ ] Provision Vercel KV per Step 1.
- [ ] Confirm `KV_REST_API_URL` + `KV_REST_API_TOKEN` set on Production + Preview (v3) scopes.
- [ ] Run smoke tests per Step 3 (3 buckets).
- [ ] Update [docs/runbooks/v3-mfa-deploy.md](v3-mfa-deploy.md) §8 — the "Multi-instance rate-limit on `/auth/mfa*`" gap is now closed (it was a D-300 known gap; D-301 closes it).

## 8. Known gaps (V3.x)

- **No `X-RateLimit-Remaining` / `X-RateLimit-Limit` headers** — only `Retry-After` is set on 429s. Adding the standard headers to every response is a V3.x cleanup.
- **No metrics emission** — KV round-trip latency isn't recorded anywhere queryable. V3.x adds Sentry / OpenTelemetry instrumentation.
- **Single Upstash region** — multi-region failover is a V3.x infra concern; for v3 MVP we accept that an Upstash regional outage = `KvLimiter` fails open globally.
- **No org-admin self-serve tuning** — limits are constants in code (5/min, 20/hour). Per-org overrides V3.x.
- **No adaptive throttling** — a user with 100 successful logins gets the same per-IP cap as a fresh anonymous IP. V3.x.

## 9. References

- Spec: [directives/301-multi-instance-rate-limit.md](../../directives/301-multi-instance-rate-limit.md)
- Plan: [docs/plans/v3-plan-v1.md](../plans/v3-plan-v1.md) §3 D-301
- Library: [src/lib/auth/rate-limit.ts](../../src/lib/auth/rate-limit.ts)
- Env template: [.env.example](../../.env.example)
- Companion runbook: [v3-mfa-deploy.md](v3-mfa-deploy.md) (D-300 — MFA depends on this rate-limit)
