# Directive 301 — Multi-instance rate-limit on Vercel KV

**Kind:** feature (V3 / Phase A — auth & security hardening)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Generated:** 2026-05-10
**Branch target:** `v3` (carried in PR [apps#42](https://github.com/builtrixlabs/AI_CRM/pull/42) alongside D-300 until that lands; subsequent directives will use clean per-directive branches off `v3`)
**Source:** `docs/plans/v3-plan-v1.md` §3 D-301
**Builds on:** D-210 (in-memory `loginBucket`), D-300 (in-memory `mfaVerifyBucket`)

---

## Problem

The two rate-limit buckets we have today — `loginBucket` (D-210, 5/min/IP on `/api/auth/rate-check`) and `mfaVerifyBucket` (D-300, 5/15min/IP on `/auth/mfa*`) — both live as **process-singleton** `TokenBucket` instances at module scope. On Vercel's autoscaling runtime, every container has its own bucket; a credential-stuffer that hits 5 instances gets `5 × N` attempts before any of them refuses.

D-301 swaps the in-memory backend for **Vercel KV** (Upstash Redis HTTP) using a sliding-window log algorithm, so all instances see the same counter. The public API (`bucket.consume(key)`) becomes async but is otherwise unchanged — five call sites get `await`. A memory backend is preserved as a dev/test fallback (auto-detected by env presence). The same primitive also lands on `/api/admin/leads/lookup` (currently un-rate-limited — D-134 ships happy-path only).

A second axis is added: **per-account email** limits (20/hour) for `/api/auth/rate-check`, fired before the per-IP check on a credential-stuffing pattern that varies IP per request but targets the same account.

## Success criteria (production target 80/90)

### Backend abstraction

- [ ] **AC-1** New `Limiter` interface in `src/lib/auth/rate-limit.ts`:
  - `consume(key: string, now?: number): Promise<ConsumeResult>` — shape unchanged from existing `TokenBucket.consume` return type.
  - Backed by either `MemoryLimiter` (rebrand of existing `TokenBucket` — sync underneath, async at the seam) or `KvLimiter` (sliding-window log via `@upstash/redis`).
- [ ] **AC-2** Backend factory `createLimiter(opts: LimiterOpts): Limiter`:
  - `LimiterOpts = { capacity, window_ms, key_prefix }`.
  - Picks `KvLimiter` when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are present in env, else falls back to `MemoryLimiter`.
  - `RATE_LIMIT_BACKEND=memory` env override forces the memory backend (useful for tests + dev where KV is undesired even if env happens to be set).
- [ ] **AC-3** Existing exports preserved: `loginBucket`, `mfaVerifyBucket`, `LOGIN_LIMIT`, `LOGIN_WINDOW_SECONDS`, `MFA_VERIFY_LIMIT`, `MFA_VERIFY_WINDOW_SECONDS`, `ipKey()`. The bucket exports become `Limiter` instances (interface-compatible) instead of `TokenBucket` class instances.

### KV implementation

- [ ] **AC-4** `KvLimiter.consume(key)` algorithm — sliding-window log:
  ```
  ZREMRANGEBYSCORE prefix:key 0 (now - window_ms)
  ZCARD prefix:key                                 -> count
  IF count >= capacity: deny
  ZADD prefix:key now now                          (score=member=now)
  EXPIRE prefix:key ceil(window_ms/1000) + 1
  ```
  Wrapped in a Lua script for atomicity (`@upstash/redis` supports `EVAL`).
- [ ] **AC-5** Hot-path latency: each `consume()` round-trip < 50ms p95 on the same Vercel region as KV. The Lua script collapses 4 round-trips to 1.
- [ ] **AC-6** Fail-open on KV outage: if the KV call throws (network, 5xx, timeout > 1s), log a warning and return `{allowed: true, remaining: capacity, retry_after_ms: 0}`. Better to let traffic through than 500-storm a deploy. Counter-pressure: the log line is plumbed to a future Sentry signal (V3.x).

### New surface coverage

- [ ] **AC-7** Per-account email limit on `/api/auth/rate-check`:
  - 20 attempts / 1 hour / lowercased email.
  - Fires *before* the per-IP limit on POSTs that include `email` in the body.
  - Implemented as a second `Limiter` instance (`loginAccountBucket`); both fired per request; either denial = 429.
  - Audit row written on denial with `action="auth.rate_limited"`, `diff: { axis: "ip" | "email" }`.
- [ ] **AC-8** `/api/admin/leads/lookup` gains the existing IP-based limiter:
  - Reuses `mfaVerifyBucket`'s shape (5/15min/IP) — actually a new `lookupBucket` with the same numbers; share the prefix `lookup:` so it doesn't collide.
  - Bearer token (per-org Voice IQ secret from D-134) is the proper auth; rate-limit is defense-in-depth against a leaked token being abused.
- [ ] **AC-9** All five existing call sites updated to `await`:
  - `src/app/api/auth/rate-check/route.ts` (loginBucket)
  - `src/app/auth/mfa/actions.ts` (mfaVerifyBucket × 2 — verifyTotp + verifyRecovery)
  - `src/app/auth/mfa/setup/actions.ts` (mfaVerifyBucket — confirmEnrollment)
  - `src/app/api/admin/leads/lookup/route.ts` (new lookupBucket)

### Configuration

- [ ] **AC-10** New env vars documented in `.env.example`:
  - `KV_REST_API_URL` — Upstash Redis REST endpoint.
  - `KV_REST_API_TOKEN` — REST API token.
  - `RATE_LIMIT_BACKEND` — optional override (`"kv" | "memory"`, default auto-detect).
  - All three optional in dev; `KV_REST_API_URL` + `KV_REST_API_TOKEN` strongly recommended in production (logged warning on every consume if running production with memory fallback).

### Tests (TDD — RED first)

- [ ] **AC-11** `tests/lib/auth/rate-limit.test.ts` (extend existing 11 cases):
  - `MemoryLimiter` parity tests (rebrand path) — existing 11 cases continue to pass against `await limiter.consume(...)`.
- [ ] **AC-12** `tests/lib/auth/kv-limiter.test.ts` (new):
  - Mock `@upstash/redis` client.
  - 5 in-window calls allowed → 6th denied.
  - After window elapses (clock advanced), allowed again.
  - Different keys isolated.
  - Lua script invocation: each `consume()` call invokes `eval` once with the right `keys[]` + `args[]`.
  - KV throw → fail-open (returns allowed).
- [ ] **AC-13** `tests/lib/auth/limiter-factory.test.ts` (new):
  - `RATE_LIMIT_BACKEND=memory` → MemoryLimiter even with KV env present.
  - `KV_REST_API_URL` present + no override → KvLimiter.
  - Neither → MemoryLimiter.
- [ ] **AC-14** `tests/app/api/auth/rate-check/per-account.test.ts` (new):
  - Same email from 21 different IPs in 1 hour → 21st request blocked by account axis.
  - Same IP, 21 different emails in 1 hour → 21st request blocked by IP axis (5/min already covers this; verify ordering).
  - Audit row written with the correct `axis` discriminator.
- [ ] **AC-15** Coverage on touched files: ≥80% lines / ≥90% branches.
- [ ] **AC-16** Gate-4 security scan: 0 CRITICAL after auto-fix loop. HIGH/MED/LOW logged + parallel-fixed.

## Non-goals (deferred to V3.x)

- **Distributed-locking semantics** — the sliding-window log has a small race where two instances reading concurrently can each see `count = capacity - 1` and both succeed in adding. The Lua script eliminates this within KV; cross-instance read-modify-write outside Lua isn't an issue here. Documented for completeness.
- **Per-route limit configuration UI** — limits are constants in code (5/min, 20/hour). Org-admin self-serve tuning is V3.x.
- **Adaptive limits / rep-based throttling** — same-key user with 100 successful logins isn't treated differently from a fresh anonymous IP. V3.x.
- **Rate-limit headers (`X-RateLimit-Remaining`, `Retry-After`)** — only `Retry-After` is set on 429. Adding the standard headers to every response is V3.x cleanup.
- **Cross-cluster / multi-region replication** — Upstash Redis is single-region by default. Multi-region failover is V3.x infra.

## Stack

- **New runtime dep:** `@upstash/redis` (~30KB, edge-runtime compatible). Vercel's `@vercel/kv` is a thin wrapper; we use Upstash directly to keep the surface vendor-neutral (Upstash also runs on AWS, GCP, etc.).
- **No new dev deps.**
- **Lua script:** authored inline as a string constant; `EVAL`'d via `@upstash/redis`'s `eval()` method. No external `.lua` file (one less artifact to ship).
- **Existing deps reused:** `bcryptjs`, `otpauth`, etc. unchanged.

## Learned patterns applied

- **`belt-and-suspenders-platform-only`** — per-IP AND per-account limits both enforced (defense-in-depth against credential stuffing that varies IP).
- **`injectable-supabase-client-for-tests`** — `KvLimiter` constructor accepts an optional `Redis` client argument so tests can pass a mock; production callers get the auto-instantiated one from env.
- **`provider-fallback-with-typed-error-discrimination`** — KV outage = "transient infra failure" → fail-open (precedent: D-009's gateway fallback policy on rate_limit/server/network).
- **`server-action-result-discriminated-union`** — denials surface as `{ allowed: false, retry_after_ms }` matching the existing TokenBucket return.

## Authority

- Constitution V — **Bounded Authority** (the rate-limit IS part of the auth boundary).
- Supersedes: D-210 § AC-3 ("In-memory token bucket; multi-instance correctness needs Vercel KV") — D-301 lands the KV backend.
- Supersedes: D-300 § "Slice 3 known gap — Multi-instance rate-limit on `/auth/mfa*` is single-instance only" — D-301 closes this.

## Operator follow-ups (not part of TDD execution)

- [ ] Provision a Vercel KV instance (Upstash Redis): https://vercel.com/dashboard → Storage → Create → KV.
- [ ] Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` on Vercel Production + Preview (v3) scopes.
- [ ] Verify `consume()` p95 latency is < 50ms on the deployed region (operator: Vercel logs + the warning log emitted on slow KV calls > 100ms).
- [ ] Update [docs/runbooks/v3-mfa-deploy.md](../docs/runbooks/v3-mfa-deploy.md) §8 — once D-301 ships, the "Multi-instance rate-limit" gap closes.
