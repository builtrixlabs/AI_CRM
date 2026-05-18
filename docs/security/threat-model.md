# Threat model — Builtrix CRM v3.0

**Date:** 2026-05-10 (D-330 prep)
**Scope:** all surfaces shipped in v3.0 — Phase A (auth), Phase B (billing + delivery + observability), Phase C (real-estate completeness). Multi-tenant SaaS deployed on Vercel with Supabase Postgres + Inngest cron + Upstash KV + Stripe billing.

This document is the **brief for an external pen-test vendor**. Each section names the threat, the existing mitigation(s) with file paths + directive references, and the residual risk our team accepts for v3.0.

---

## OWASP Top 10 (2021) coverage

### A01:2021 Broken Access Control

| Control | Status | Evidence | Directive |
|---|---|---|---|
| Tenant isolation via JWT claim | Mitigated | `auth.org_id()` SQL helper + RLS USING predicate on every tenant table; client never controls org_id | D-001 |
| Cross-tenant probe (programmatic) | Mitigated | `tests/integration/rls-audit.test.ts` enumerates every public table; pinpoint negative tests for nodes/edges/node_signals/api_audit_log/org_integration_secrets | D-302 |
| Force sign-out on suspend | Mitigated | `org_session_revocations` table + `getCurrentUser` fail-closed RPC check (`app_is_org_revoked`) | D-302 |
| Bearer-token rate-limit on lookup | Mitigated | `lookupBucket` (5/15min/IP) at `/api/admin/leads/lookup` defends a leaked Voice IQ token | D-301 |
| Permission catalog drift | Mitigated | `tests/lib/auth/permission-catalog.test.ts` "no orphan perms"; PLATFORM_ONLY enforced at resolver AND DB-trigger layers | D-003 |
| **Residual** | Acknowledged | DNS-rebinding mitigation for outbound webhook delivery is V3.x. `checkUrlSsrf` blocks loopback/RFC-1918 syntactically (D-311); a malicious DNS could still resolve a public domain to a private IP at fetch time. |

### A02:2021 Cryptographic Failures

| Control | Status | Evidence | Directive |
|---|---|---|---|
| TOTP secrets at rest | Mitigated | AES-256-GCM with per-call 12-byte IV; key from `MFA_ENCRYPTION_KEY` env (32-byte hex); production fail-fast on missing key | D-300 |
| Webhook signing | Mitigated | HMAC-SHA256 (timing-safe verify) on inbound + outbound. Header `x-builtrix-signature: sha256=<hex>` | D-010, D-311 |
| Stripe signature verification | Mitigated | `stripe.webhooks.constructEvent` (official SDK, timing-safe) | D-310 |
| Recovery codes | Mitigated | bcryptjs cost 10; single-use enforced by `used_at` stamp on jsonb array | D-300 |
| **Residual** | Acknowledged | bcrypt cost is OWASP 2023 minimum (10); bumping to 12 is V3.x. Endpoint secrets in `webhook_endpoints.secret` stored plaintext (pre-existing v2 D-208 design); column-level encryption is V3.x. |

### A03:2021 Injection

| Control | Status | Evidence | Directive |
|---|---|---|---|
| SQL injection | Mitigated | All app code uses Supabase fluent client (parameterised). Zero `rpc()` with template-literal SQL. | systemic |
| Command / shell injection | Not applicable | App doesn't shell out at runtime. Build-time only. |  |
| XSS | Mitigated | React JSX auto-escape; zero `dangerouslySetInnerHTML` audited. | systemic |
| ILIKE injection (Cmd+K search) | Mitigated | LIKE-special chars escaped before `%` wrapping | D-008 |
| Search-path injection in SECURITY DEFINER | Mitigated | Every `app_*` and `prune_*` function declares `SET search_path = public` | D-302, D-312 |
| **Residual** | None at v3.0. |  |

### A04:2021 Insecure Design

| Control | Status | Evidence | Directive |
|---|---|---|---|
| Append-only invariants | Mitigated | `audit_log`, `api_audit_log`, `event_inbox_log`, `stripe_event_log` all append-only via trigger; not RLS-no-policy (which service-role bypasses) | D-001, D-310 |
| Bounded agent authority | Mitigated | T2 = templated, no `gateway.complete()`; T3 stops at runtime pending approval; agent-tier ceiling enforced at runtime AND DB trigger | D-009, D-322 |
| Idempotency on async dispatchers | Mitigated | Stripe webhook event_log PK; webhook delivery via partial unique on (org, lead_id, agent_kind) WHERE pending; DOE invocation idempotent on (directive, subject, trigger) | D-310, D-322, D-011 |
| **Residual** | None at v3.0. |  |

### A05:2021 Security Misconfiguration

| Control | Status | Evidence | Directive |
|---|---|---|---|
| Env var validation | Mitigated | Middleware `envConfigError` returns plaintext 500 on missing `SUPABASE_*`. `MFA_ENCRYPTION_KEY` fail-fast in `getKey()`. `STRIPE_SECRET_KEY`/`WEBHOOK_SECRET` fail-fast on first use. | D-300, D-310 |
| Demo bypass guard | Mitigated | `MFA_DEMO_MODE` documented in `docs/runbooks/demo-mode.md`; default off; only the env path (not platform_flag) shorts MFA after D-300 | D-300 |
| KV multi-instance fallback warning | Mitigated | `console.warn` at module load if NODE_ENV=production and KV env missing | D-301 |
| **Residual** | Acknowledged | No runtime warning when `MFA_DEMO_MODE=true` in production NODE_ENV. V3.x. |

### A06:2021 Vulnerable and Outdated Components

| Control | Status | Evidence |
|---|---|---|
| Dependabot / npm audit | Operator-led | `npm audit` reported via CI; upgrade cadence is operator policy. |
| Pinned major versions | Operator-led | `package.json` uses `^x.y.z`; minor + patch auto-eligible. |
| **Residual** | Operator decides upgrade cadence post-tag. Bug-bounty program for critical-vuln disclosure is V3.x. |

### A07:2021 Identification and Authentication Failures

| Control | Status | Evidence | Directive |
|---|---|---|---|
| Real TOTP MFA + recovery codes | Mitigated | Hard redirect on stale MFA for sensitive routes; ±30s skew window; recovery code single-use; rate-limit 5/15min/IP | D-300 |
| Multi-instance rate-limit on login | Mitigated | KV-backed sliding-window (Lua script atomicity) | D-301 |
| Per-account axis on login | Mitigated | `loginAccountBucket` (20/hr/email) fires before per-IP on credential-stuffing pattern | D-301 |
| **Residual** | Acknowledged | Trusted-device "remember me 30 days" cookie not implemented (every device re-verifies per freshness window). V3.x. WebAuthn/passkeys V3.x. |

### A08:2021 Software and Data Integrity Failures

| Control | Status | Evidence | Directive |
|---|---|---|---|
| Webhook signature verification (inbound) | Mitigated | HMAC-SHA256 timing-safe at `/api/events/inbox` (Voice IQ) | D-010, D-130 |
| Webhook signature verification (outbound) | Mitigated | We sign every outbound delivery with the endpoint's secret | D-311 |
| Stripe event idempotency | Mitigated | `stripe_event_log` PK on `event.id` — replay returns 200 without re-processing | D-310 |
| Append-only invariants | Mitigated | See A04 above |  |
| **Residual** | None at v3.0. |  |

### A09:2021 Security Logging and Monitoring Failures

| Control | Status | Evidence | Directive |
|---|---|---|---|
| Audit log on every privileged action | Mitigated | `audit_log` row per write across canvases, suspend/reactivate, MFA enroll/verify, agent approve/reject, retention prune, etc. | systemic |
| API request audit | Mitigated | `withApiAudit` wrapper on every `/api/*` route; `api_audit_log` table | D-204 |
| Retention prune | Mitigated | Daily cron at 03:00 UTC bounds `api_audit_log` (90d), `event_inbox_log` (30d), `webhook_deliveries` (60d) | D-312 |
| Sentry / OpenTelemetry instrumentation | Acknowledged-as-V3.x | No external SIEM today; app-side audit + Vercel logs only |  |
| **Residual** | Audit data exfiltration on read is mitigated by RLS (super-admin only); no off-system replication for tamper-resistant archival — V3.x. |

### A10:2021 Server-Side Request Forgery

| Control | Status | Evidence | Directive |
|---|---|---|---|
| Outbound webhook URL validation | Mitigated (syntactic) | `checkUrlSsrf` blocks loopback (`127.0.0.1`, `localhost`), RFC-1918 (`10/8`, `192.168/16`, `172.16/12`), link-local (`169.254/16`), reserved (`0.0.0.0`), IPv6 ULA (`fc00::/7`) and link-local (`fe80::/10`) before fetch | D-311 |
| **Residual** | Acknowledged | DNS-rebinding (host resolves to public IP at registration time but private IP at fetch time) not blocked. V3.x adds DNS-resolution check + cache. |

---

## Authentication boundary depth

For pen-test prioritisation, the auth boundary has three layers:

1. **Edge** (`src/middleware.ts` + `decideRoute`) — pure-function role-based decision + MFA gate. Runs on every authenticated request.
2. **App layer** (`getCurrentUser`) — fetches `profiles`, checks `org_session_revocations` (D-302), returns null on suspend → middleware bounces. Also returns null on RPC error (fail-closed).
3. **DB layer** (RLS) — `auth.org_id()` predicate on every tenant table; `app_is_super_admin()` for platform-only surfaces; super-admin-only `org_session_revocations` write path.

A bypass at any one layer is bounded by the other two. The pen-test should attempt to exfiltrate a row from one org while authenticated as another. (`tests/integration/rls-audit.test.ts` already exercises this programmatically.)

## High-priority test paths for the vendor

1. `/api/auth/rate-check` per-account rate-limit at 21 attempts / 1 hour from varied IPs.
2. `/api/admin/leads/lookup` with a stolen Voice IQ Bearer — confirm cross-org returns 404 (no existence leak).
3. Stripe webhook with tampered body but valid stripe-signature header (engineered) → expect 400.
4. Outbound webhook URL set to `http://169.254.169.254/latest/meta-data/` → expect dead status with `error=ssrf_blocked:link_local`.
5. Suspended org user with a still-valid JWT visiting `/admin/billing` → expect redirect to `/auth/sign-in` within 1 request.
6. Cross-org SELECT on `nodes`, `edges`, `node_signals` as user A querying org B's UUID → expect 0 rows.
7. Backward unit-status transition (booked → available) as sales_rep → expect `error: "override_required"`.
8. Stripe Checkout success → webhook → confirm DB row created for *correct* org_id from `metadata.org_id`, not from any other client-supplied field.

## V3.x backlog from this exercise

- DNS-rebinding mitigation on outbound webhook delivery.
- Bcrypt cost 10 → 12 (after perf budget allows).
- Webhook endpoint secret column-level encryption.
- Trusted-device cookie + WebAuthn / passkeys.
- Sentry / OTEL for centralised audit + p95 perf monitoring.
- Bug-bounty program post-pen-test.
- Cloudflare WAF in front of Vercel.
- Tamper-resistant audit archive (hash-chained or off-system).
