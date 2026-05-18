# Directive 210 — Login rate limit + cross-surface guard tighten

**Kind:** feature (V2 / Phase B — security)
**Status:** AUTHORIZED — operator approved 2026-05-09
**Branch target:** `v2`
**Source:** `docs/plans/admin-and-voice-iq-merged-plan-v1.md` §3 D-210

---

## Problem

Two security gaps:
1. No rate limit on `/auth/sign-in`. A bot can pummel password attempts.
2. The cross-surface route policy (D-001) hasn't been recently exercised in tests for forge attempts (e.g. an org_admin manually crafting `/platform/...` URLs).

D-210 ships a 5-attempts-per-60s in-memory token bucket keyed on IP, exposed via `/api/auth/rate-check`. The sign-in page pings it before calling Supabase auth. Multi-instance Vercel needs KV — out of scope for v2 demo (single instance). Plus a small expansion to the route-policy test suite for forge-attempt coverage.

## Success criteria (demo lens — v2 quality target 70/80)

- [ ] **AC-1** Library `src/lib/auth/rate-limit.ts`: in-memory `TokenBucket` with `consume(key, now)` returning `{allowed, remaining, retry_after_ms}`. 5 tokens, refill rate = 5/60s.
- [ ] **AC-2** Route `POST /api/auth/rate-check` — reads x-forwarded-for, calls bucket.consume, returns `{allowed, remaining, retry_after_seconds}`. Wraps in `withApiAudit`. Returns 429 when blocked (audited at 429).
- [ ] **AC-3** Sign-in page (`/auth/sign-in`) calls `/api/auth/rate-check` before invoking Supabase; if 429, surfaces "Too many attempts — wait Xs" without calling Supabase.
- [ ] **AC-4** Constants exposed: `LOGIN_LIMIT = 5`, `LOGIN_WINDOW_SECONDS = 60`. Tunable via env later (V3).
- [ ] **AC-5** Cross-surface guard test: extend `tests/lib/auth/route-policy.test.ts` with explicit "forge" cases — org_admin requesting `/platform/anything` → redirect to `/admin`; super_admin on `/admin/*` → redirect to `/platform`. (These were already partially covered; D-210 ensures explicit assertions exist for every role × every blocked surface.)

## Tests

- [ ] **AC-6** Token-bucket: 5 consumes succeed; 6th returns `allowed=false`; refill after window.
- [ ] **AC-7** API route: returns 200 with remaining=4 on first hit; returns 429 after the limit.
- [ ] **AC-8** Coverage on touched files ≥ 70% lines / ≥ 80% branches.

## Non-goals

- Vercel KV / Upstash backing — V3 (multi-instance correctness).
- Per-account (vs per-IP) rate limit — V3.
- Distributed lockout for sustained brute-force — V3.

## Stack

In-memory Map + Date.now() + the existing `withApiAudit` wrapper.
