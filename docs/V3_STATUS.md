# V3 Status — what's shipped, file map, how to navigate

**Date:** 2026-05-10
**Branch:** `v2`
**Tip commit:** `caf93a8` (Merge PR #46 — D-330 V3.0 sign-off)
**Tag:** `v3.0` (annotated at `fc391b7`)
**Verification:** vitest **1240/1240 green** · tsc clean (non-e2e paths) · 10 directives across 4 phases · 6 additive migrations · `security-scanner` agent: clean / 0 CRITICAL / 0 HIGH

This doc is the canonical source of truth for v3 feature status. It is the **engineer's reference** for re-finding any v3 implementation. Five sections:

1. **Implemented and shipped** — per-directive file map.
2. **Cumulative schema changes** — 6 v3 migrations.
3. **Engineer navigation map** — "if you want to look at X, here's where it lives".
4. **Per-feature status table** — complete vs partial vs not-built.
5. **V3.x backlog** — what's intentionally deferred.

For the v2 build status see [docs/V2_STATUS.md](V2_STATUS.md). For the merged v3 plan see [docs/plans/v3-plan-v1.md](plans/v3-plan-v1.md).

---

## 1. Implemented and shipped on `v2` (v3.0 tag)

### Phase A — Auth & security hardening (3 directives)

| ID | Directive | What shipped | PR |
|---|---|---|---|
| **D-300** | [`real-totp-mfa`](../directives/300-real-totp-mfa.md) | Real TOTP enrollment + 10 single-use recovery codes; AES-256-GCM encrypted secrets; bcryptjs-hashed codes; hard-redirect on stale MFA for sensitive routes; `MFA_DEMO_MODE` bypass preserved. | [#42](https://github.com/builtrixlabs/AI_CRM/pull/42) |
| **D-301** | [`multi-instance-rate-limit`](../directives/301-multi-instance-rate-limit.md) | Vercel KV-backed sliding-window-log limiter via Lua EVAL; per-IP + per-account axes; auto-detects KV by env; fail-open on outage; applied to `/api/auth/rate-check`, `/auth/mfa*`, `/api/admin/leads/lookup`. | [#42](https://github.com/builtrixlabs/AI_CRM/pull/42) |
| **D-302** | [`rls-audit-and-force-signout`](../directives/302-rls-audit-and-force-signout.md) | Programmatic RLS audit suite (live-DB) + `org_session_revocations` table + `getCurrentUser` fail-closed RPC check; `app_is_org_revoked(uuid)` SECURITY DEFINER. | [#42](https://github.com/builtrixlabs/AI_CRM/pull/42) |

### Phase B — Billing + delivery + observability (3 directives)

| ID | Directive | What shipped | PR |
|---|---|---|---|
| **D-310** | [`stripe-billing`](../directives/310-stripe-billing.md) | Stripe Subscriptions integration; webhook receiver with idempotency via `stripe_event_log`; `subscription_plans` table replaces hardcoded `PLAN_TIERS`; self-serve Checkout + Billing Portal; 30-day grace on failed payment. | [#42](https://github.com/builtrixlabs/AI_CRM/pull/42) |
| **D-311** | [`webhook-delivery-worker`](../directives/311-webhook-delivery-worker.md) | Inngest cron `* * * * *` outbound delivery; 1m → 5m → 30m → 2h → 12h retry schedule; auto-disable after 10 consecutive fails; SSRF guard blocks loopback/RFC-1918/link-local/IPv6-ULA. | [#42](https://github.com/builtrixlabs/AI_CRM/pull/42) |
| **D-312** | [`audit-retention-and-time-series`](../directives/312-audit-retention-and-time-series.md) | Daily 03:00 UTC prune cron for `api_audit_log`/`event_inbox_log`/`webhook_deliveries` (90/30/60 day defaults via `platform_flags`); time-series view at `/platform/analytics?days=30/60/90`; per-route cost categorization on `/platform/costs`. | [#42](https://github.com/builtrixlabs/AI_CRM/pull/42) |

### Phase C — Real-estate daily-use completeness (3 directives)

| ID | Directive | What shipped | PR |
|---|---|---|---|
| **D-320** | [`catalog-editing`](../directives/320-catalog-editing.md) | Editable `/admin/catalog/[id]/edit` (property) + `/admin/catalog/[id]/units/[unitId]/edit` (unit); state-machine-gated unit status transitions (`available → held → booked → sold` one-way); optimistic locking via `updated_at`; new `catalog:admin_override` permission. | [#43](https://github.com/builtrixlabs/AI_CRM/pull/43) |
| **D-321** | [`deal-canvas`](../directives/321-deal-canvas.md) (impl ref) | Read-only `/dashboard/deals/[id]` mirroring lead canvas pattern; stage timeline (`qualified → site_visit_scheduled → site_visit_done → negotiation → booked`); side panel + linked leads/units/activity; "Promote lead to deal" button on lead canvas. | [#44](https://github.com/builtrixlabs/AI_CRM/pull/44) |
| **D-322** | [`follow-up-agent-t2-approval-queue`](../directives/322-follow-up-agent-t2-approval-queue.md) | T2 templated follow-up agent (no LLM, per Constitution I); 6h Inngest cron sweeps stale leads; `/admin/agents/queue` UI for approve/edit/reject (with reason); partial UNIQUE INDEX dedupes pending drafts. | [#45](https://github.com/builtrixlabs/AI_CRM/pull/45) |

### Phase D — V3.0 sign-off (1 directive)

| ID | Directive | What shipped | PR |
|---|---|---|---|
| **D-330** | [`v1-hardening-pen-test-prep`](../directives/330-v1-hardening-pen-test-prep.md) | OWASP Top 10 (2021) threat model scored against the codebase; 7 ASCII auth-flow diagrams; SOC 2 Type 1 prelim checklist with subprocessor list + maturity scorecard; structural test asserting every SECURITY DEFINER function declares explicit `search_path`. | [#46](https://github.com/builtrixlabs/AI_CRM/pull/46) |

---

## 2. Cumulative schema changes on v3

6 additive migrations (no drops, no destructive changes; all idempotent on re-apply):

| File | Adds | Directive |
|---|---|---|
| [`20260510120000_profiles_mfa_secret.sql`](../supabase/migrations/20260510120000_profiles_mfa_secret.sql) | `profiles.mfa_secret jsonb`, `profiles.mfa_recovery_codes jsonb`, `profiles.mfa_enrolled_at timestamptz` | D-300 |
| [`20260510120100_org_session_revocations.sql`](../supabase/migrations/20260510120100_org_session_revocations.sql) | `org_session_revocations` table + super-admin RLS + `app_is_org_revoked(uuid)` SECURITY DEFINER | D-302 |
| [`20260510120200_subscription_plans_and_stripe.sql`](../supabase/migrations/20260510120200_subscription_plans_and_stripe.sql) | `subscription_plans` table (DB source-of-truth), `subscriptions.stripe_customer_id/stripe_subscription_id/grace_period_until` columns, `stripe_event_log` table (append-only) | D-310 |
| [`20260510120300_webhook_delivery_real.sql`](../supabase/migrations/20260510120300_webhook_delivery_real.sql) | `webhook_endpoints.disabled_at/consecutive_failures`, `webhook_deliveries.payload/status/attempt_number/next_retry_at/error_message/delivered_at` | D-311 |
| [`20260510120400_audit_retention_and_prune.sql`](../supabase/migrations/20260510120400_audit_retention_and_prune.sql) | `prune_api_audit_log/prune_event_inbox_log/prune_webhook_deliveries` SECURITY DEFINER fns + `retention_days_*` platform_flags rows | D-312 |
| [`20260510120500_agent_approval_queue.sql`](../supabase/migrations/20260510120500_agent_approval_queue.sql) | `agent_approval_queue` table + partial UNIQUE INDEX on pending dedupe + tenant-SELECT RLS | D-322 |

---

## 3. Engineer navigation map

The most-asked questions, with file paths.

### Where is the auth boundary?

| Layer | File | What it does |
|---|---|---|
| **Edge middleware** | [`src/middleware.ts`](../src/middleware.ts) | Calls `getCurrentUser` + `decideRoute`; computes `mfa_state` from profile + `MFA_DEMO_MODE` env. |
| **Route policy (pure)** | [`src/lib/auth/route-policy.ts`](../src/lib/auth/route-policy.ts) | `decideRoute(user, path, mfa_state?)` returns `allow / redirect / unauthorized`. MFA gate fires after role decision. 40 unit tests. |
| **App layer** | [`src/lib/auth/getCurrentUser.ts`](../src/lib/auth/getCurrentUser.ts) | Loads profile, checks `app_is_org_revoked` RPC (D-302), returns `null` on suspend or RPC error (fail-closed). |
| **Sensitive route patterns** | [`src/lib/auth/sensitive-routes.ts`](../src/lib/auth/sensitive-routes.ts) | Edge-safe regex list — `isSensitiveRoute(path)`. |
| **Freshness window** | [`src/lib/auth/freshness.ts`](../src/lib/auth/freshness.ts) | `isMfaFresh()` + `defaultFreshnessMs()` from `MFA_FRESHNESS_HOURS` env. |
| **DB layer (RLS)** | every `*.sql` migration | `USING (organization_id = auth.org_id())` on every tenant table. Audited by `tests/integration/rls-audit.test.ts`. |

### MFA implementation (D-300)

| File | What it does |
|---|---|
| [`src/lib/auth/totp.ts`](../src/lib/auth/totp.ts) | `generateSecret()`, `encryptSecret()`/`decryptSecret()` (AES-256-GCM), `verifyCode()` (±30s skew), `buildOtpauthUrl()`. Pure crypto. |
| [`src/lib/auth/recovery-codes.ts`](../src/lib/auth/recovery-codes.ts) | `generateCodes()`, `hashCode()`/`verifyCodeHash()` (bcryptjs cost 10), `markCodeUsed()` (single-use enforcement). |
| [`src/app/auth/mfa/setup/page.tsx`](../src/app/auth/mfa/setup/page.tsx) + [`actions.ts`](../src/app/auth/mfa/setup/actions.ts) | Enrollment: generate, render QR + 10 codes one-time, verify code, persist. |
| [`src/app/auth/mfa/page.tsx`](../src/app/auth/mfa/page.tsx) + [`actions.ts`](../src/app/auth/mfa/actions.ts) | Re-verify: TOTP code OR recovery code. Bumps `mfa_verified_at`. |

### Rate-limit implementation (D-301)

| File | What it does |
|---|---|
| [`src/lib/auth/rate-limit.ts`](../src/lib/auth/rate-limit.ts) | `Limiter` interface, `MemoryLimiter` + `KvLimiter` impls, `createLimiter()` factory, 4 named buckets (`loginBucket`, `loginAccountBucket`, `mfaVerifyBucket`, `lookupBucket`). |

### Force-sign-out + RLS audit (D-302)

| File | What it does |
|---|---|
| [`src/lib/security/rls-audit.ts`](../src/lib/security/rls-audit.ts) | `enumerateTenantTables`, `probeCrossOrgRead`, `probeCrossOrgInsert`, `rlsErrorIsExpectedDenial`. Pure injectable-client helpers. |
| [`tests/integration/rls-audit.test.ts`](../tests/integration/rls-audit.test.ts) | Live-DB suite — provisions 2 scratch orgs, enumerates every public tenant table, asserts cross-org SELECT returns 0 rows. Run via `npm run test:rls-audit`. |
| [`src/lib/platform/subscriptions.ts`](../src/lib/platform/subscriptions.ts) `suspendOrg`/`reactivateOrg` | Insert/delete `org_session_revocations` row alongside the status change. |

### Stripe billing (D-310)

| File | What it does |
|---|---|
| [`src/lib/billing/stripe.ts`](../src/lib/billing/stripe.ts) | Single seam for Stripe SDK. `createCheckoutSession`, `createBillingPortalSession`, `retrieveSubscription`, `verifyWebhookSignature`. |
| [`src/lib/billing/plans.ts`](../src/lib/billing/plans.ts) | `getPlan(tier)` / `listPlans()` reading `subscription_plans` with fallback to constants. |
| [`src/lib/billing/webhook-handlers.ts`](../src/lib/billing/webhook-handlers.ts) | 5 handlers: subscription created/updated/deleted + invoice paid/payment_failed. All UPDATE-deterministic (idempotent). |
| [`src/app/api/stripe/webhook/route.ts`](../src/app/api/stripe/webhook/route.ts) | Receiver with raw-body signature verify + idempotency via `stripe_event_log` PK. |
| [`src/app/(admin)/admin/billing/actions.ts`](../src/app/(admin)/admin/billing/actions.ts) | `upgradeToTierAction`, `billingPortalAction`. |

### Outbound webhook delivery (D-311)

| File | What it does |
|---|---|
| [`src/lib/webhooks/signing.ts`](../src/lib/webhooks/signing.ts) | HMAC-SHA256 sign + timing-safe verify. Mirrors D-010 inbound primitive. |
| [`src/lib/webhooks/retry.ts`](../src/lib/webhooks/retry.ts) | `nextRetryAt(attempt, now)` returns next timestamp or `null` if max attempts. |
| [`src/lib/webhooks/deliver.ts`](../src/lib/webhooks/deliver.ts) | `attemptDelivery(delivery, endpoint, fetch)` — ONE POST + classify response. `checkUrlSsrf(url)` blocks loopback / RFC-1918 / link-local / IPv6 ULA syntactically. |
| [`src/lib/webhooks/worker.ts`](../src/lib/webhooks/worker.ts) | `runWebhookWorker(client, fetch)` — batch sweep, auto-disable at 10 consecutive fails. |
| [`src/lib/inngest/functions/webhooks-deliver.ts`](../src/lib/inngest/functions/webhooks-deliver.ts) | Inngest cron `* * * * *`. |
| [`src/app/(admin)/admin/webhooks/actions.ts`](../src/app/(admin)/admin/webhooks/actions.ts) | `resendDeliveryAction`, `reenableEndpointAction` (D-311 additions). |

### Retention + analytics + cost categorization (D-312)

| File | What it does |
|---|---|
| [`src/lib/platform/retention.ts`](../src/lib/platform/retention.ts) | `pruneAll(client)` calls all 3 SECURITY DEFINER fns; `pruneOne(table, days, floor, client)`. |
| [`src/lib/inngest/functions/audit-prune.ts`](../src/lib/inngest/functions/audit-prune.ts) | Daily 03:00 UTC cron. |
| [`src/lib/platform/analytics.ts`](../src/lib/platform/analytics.ts) | `getKpisOverWindow(days, client)` → per-day buckets; `bucketsToCsv(kpi, buckets)` → CSV string. Also still has v2 `getPlatformKpis`. |
| [`src/lib/platform/costs.ts`](../src/lib/platform/costs.ts) | `categorizePath(path)` → `voice_iq_inbox` / `voice_iq_lookup` / `other`. `getOrgCosts` now returns the 3 aggregate columns. |
| [`src/components/platform/sparkline.tsx`](../src/components/platform/sparkline.tsx) | Pure-SVG sparkline, zero deps. |
| [`src/app/(platform)/platform/analytics/`](../src/app/(platform)/platform/analytics/) | Page + `actions.ts` (`exportKpiCsvAction`) + `csv-button.tsx`. |
| [`src/app/(platform)/platform/costs/page.tsx`](../src/app/(platform)/platform/costs/page.tsx) | Real per-org table replacing v2 placeholder. |

### Catalog editing (D-320)

| File | What it does |
|---|---|
| [`src/lib/catalog/transitions.ts`](../src/lib/catalog/transitions.ts) | Pure unit-status state machine. `assertTransitionAllowed(from, to, has_override)`. Same one-way pattern as D-321 deal stages. |
| [`src/lib/catalog/api.ts`](../src/lib/catalog/api.ts) | `updateUnit` + `updateProperty` with Zod validation, optimistic locking, audit_log diff. |
| [`src/app/(admin)/admin/catalog/[id]/edit/page.tsx`](../src/app/(admin)/admin/catalog/[id]/edit/page.tsx) + [`actions.ts`](../src/app/(admin)/admin/catalog/[id]/edit/actions.ts) | Property edit form + action. |
| [`src/app/(admin)/admin/catalog/[id]/units/[unitId]/edit/`](../src/app/(admin)/admin/catalog/[id]/units/[unitId]/edit/) | Unit edit form + action. Status dropdown disables backward options when caller lacks `catalog:admin_override`. |

### Deal canvas (D-321)

| File | What it does |
|---|---|
| [`src/lib/deals/transitions.ts`](../src/lib/deals/transitions.ts) | Deal stage state machine. `qualified → … → booked`; `lost` from any non-booked; backward + from-terminal need override. |
| [`src/lib/deals/api.ts`](../src/lib/deals/api.ts) | `getDealCanvas(deal_id)` — partitioned graph view. `promoteLeadToDeal(input)` — idempotent insert + edge + audit. |
| [`src/app/(dashboard)/dashboard/deals/[id]/page.tsx`](../src/app/(dashboard)/dashboard/deals/[id]/page.tsx) | Read-only deal canvas: stage timeline, side info, linked leads/units, activity stream. |
| [`src/components/canvas/promote-to-deal-button.tsx`](../src/components/canvas/promote-to-deal-button.tsx) | Client component on the lead canvas; calls `promoteLeadToDealAction`. |
| `promoteLeadToDealAction` in [`src/app/(dashboard)/dashboard/_actions/leads.ts`](../src/app/(dashboard)/dashboard/_actions/leads.ts) | Server action (gates on `deals:create` perm + tenant pre-check). |

### Follow-up Agent (D-322)

| File | What it does |
|---|---|
| [`src/lib/agents/follow-up-stale-lead.ts`](../src/lib/agents/follow-up-stale-lead.ts) | T2 templated agent (no LLM). `draftFollowUp(lead)` → `{channel, body}`. `findStaleLeads(org, now, client)` → leads stale > 7d. `enqueueFollowUpDraft(lead, client)` → INSERT with 23505 detection. `runFollowUpAgent(client)` — cron entry. |
| [`src/lib/inngest/functions/follow-up-agent-sweep.ts`](../src/lib/inngest/functions/follow-up-agent-sweep.ts) | 6h Inngest cron `0 */6 * * *`. |
| [`src/app/(admin)/admin/agents/queue/page.tsx`](../src/app/(admin)/admin/agents/queue/page.tsx) | Org-admin queue listing. |
| [`src/app/(admin)/admin/agents/queue/queue-item.tsx`](../src/app/(admin)/admin/agents/queue/queue-item.tsx) | Client component with approve / edit-and-approve / reject controls. |
| [`src/app/(admin)/admin/agents/queue/actions.ts`](../src/app/(admin)/admin/agents/queue/actions.ts) | `approveQueueItemAction`, `rejectQueueItemAction`. |

### Inngest cron registry

All v3 crons land in [`src/app/api/inngest/route.ts`](../src/app/api/inngest/route.ts):

| Cron | Schedule | Function | Directive |
|---|---|---|---|
| `embedding-refresh` | (existing) | embedding queue | D-002 |
| `lead-enrichment-on-create` | (existing) | LLM enrichment | D-009 |
| `doe-on-lead-created` | (existing) | DOE dispatch | D-011 |
| `site-visit-window-sweep` | `*/15 * * * *` | site-visit reminders | D-012 |
| `webhooks-deliver` | `* * * * *` | outbound delivery | **D-311** |
| `audit-prune` | `0 3 * * *` | retention prune | **D-312** |
| `follow-up-agent-sweep` | `0 */6 * * *` | T2 agent | **D-322** |

---

## 4. Per-feature status table

| Surface / capability | Status | Notes |
|---|---|---|
| Real TOTP MFA | ✅ complete | D-300 |
| Recovery codes (single-use) | ✅ complete | D-300 |
| Hard MFA redirect on sensitive routes | ✅ complete | D-300 |
| KV-backed rate-limit (multi-instance) | ✅ complete | D-301 |
| Per-account login axis (20/hr/email) | ✅ complete | D-301 |
| Programmatic RLS audit | ✅ complete | D-302 (`npm run test:rls-audit`) |
| Force sign-out on suspend | ✅ complete | D-302 |
| Stripe Subscriptions integration | ✅ complete | D-310 |
| Stripe webhook receiver + idempotency | ✅ complete | D-310 |
| Stripe Billing Portal | ✅ complete | D-310 |
| Outbound webhook delivery worker | ✅ complete | D-311 |
| Retry + auto-disable at 10 fails | ✅ complete | D-311 |
| SSRF guard on outbound URLs | ✅ complete (syntactic) | D-311 — DNS-rebinding mitigation V3.x |
| Audit retention prune (daily) | ✅ complete | D-312 |
| `/platform/analytics` time-series | ✅ complete (bookings + sv_completed) | D-312 — conversion as derived metric V3.x |
| CSV export per KPI | ✅ complete | D-312 |
| `/platform/costs` per-route categorization | ✅ complete | D-312 |
| `/admin/catalog/[id]/edit` (property) | ✅ complete | D-320 |
| `/admin/catalog/[id]/units/[unitId]/edit` (unit) | ✅ complete | D-320 |
| Unit status state-machine + override | ✅ complete | D-320 |
| Optimistic locking on catalog edits | ✅ complete | D-320 |
| Deal canvas at `/dashboard/deals/[id]` | ✅ complete (read-only) | D-321 — full edit canvas V3.x |
| "Promote lead to deal" action | ✅ complete | D-321 |
| Follow-up Agent T2 + approval queue | ✅ complete (templated) | D-322 — T3 with LLM is V3.x |
| Pen-test prep package | ✅ complete | D-330 — `docs/security/threat-model.md`, `auth-flow.md` |
| SOC 2 Type 1 prelim package | ✅ complete | D-330 — `docs/security/soc2-readiness.md` |
| SECURITY DEFINER search_path test | ✅ complete | D-330 |

**Legend:** ✅ complete · 🟡 partial (visually shipped, V3.x deepens) · ❌ not built

---

## 5. Operator runbooks index

Each Phase A/B/C directive ships a runbook for operator setup:

| Runbook | What it covers | Directive |
|---|---|---|
| [`docs/runbooks/v3-mfa-deploy.md`](runbooks/v3-mfa-deploy.md) | Generate `MFA_ENCRYPTION_KEY`, set on Vercel, apply migration, 10-step smoke test, lost-device unblock SQL. | D-300 |
| [`docs/runbooks/demo-mode.md`](runbooks/demo-mode.md) | `MFA_DEMO_MODE` env behavior, when to enable, how to verify off in prod. | D-300 |
| [`docs/runbooks/v3-rate-limit-deploy.md`](runbooks/v3-rate-limit-deploy.md) | Provision Vercel KV, env wiring, 3-bucket smoke tests with curl, audit query, latency check. | D-301 |
| [`docs/runbooks/v3-rls-audit.md`](runbooks/v3-rls-audit.md) | Apply migration, run RLS audit, suspend/reactivate smoke flow, audit query, rollback. | D-302 |
| [`docs/runbooks/v3-stripe-billing.md`](runbooks/v3-stripe-billing.md) | Stripe Dashboard product setup, `lookup_key` per tier, webhook endpoint registration, smoke test with `4242` test card. | D-310 |
| [`docs/runbooks/v3-webhook-delivery.md`](runbooks/v3-webhook-delivery.md) | Apply migration, smoke test against `webhook.site`, retry/auto-disable test, rollback. | D-311 |
| [`docs/runbooks/v3-audit-retention.md`](runbooks/v3-audit-retention.md) | Apply migration, validate trigger-disable path, tune retention via `platform_flags`. | D-312 |

**Security docs (D-330):**

| File | Purpose |
|---|---|
| [`docs/security/threat-model.md`](security/threat-model.md) | OWASP Top 10 (2021) scored. Pen-test vendor brief. |
| [`docs/security/auth-flow.md`](security/auth-flow.md) | 7 ASCII auth-flow diagrams (sign-in, MFA enroll/verify, suspend, RLS query, Stripe webhook, outbound webhook). |
| [`docs/security/soc2-readiness.md`](security/soc2-readiness.md) | SOC 2 Type 1 prelim package. Subprocessor list. Maturity scorecard. |

---

## 6. V3.x backlog — explicitly deferred

Carried over from each directive's "Non-goals" section. Grouped by area.

### Auth & security (V3.x)

- WebAuthn / passkeys — TOTP is the v3 second factor.
- Hardware tokens (Yubikey, FIDO2) — V3.x.
- Trusted-device cookie — every device re-verifies per freshness window.
- bcrypt cost 10 → 12 — meets OWASP 2023 minimum; bump when perf budget allows.
- Per-account email-verification before MFA reset — operator manual reset only.
- DNS-rebinding mitigation on outbound webhook delivery — currently syntactic SSRF block only.
- Webhook endpoint `secret` column-level encryption — pre-existing v2 D-208 design.
- Per-org override for `MFA_FRESHNESS_HOURS` — global only.

### Billing (V3.x)

- Auto-suspend cron when `grace_period_until` expires — manual super-admin action only.
- Plan-CRUD UI — `subscription_plans` is editable via SQL only.
- Per-org custom-pricing overrides — `custom` tier still uses request-via-ticket.
- Annual billing — monthly only.
- Stripe Tax integration.
- Refund flow — operator handles in Stripe dashboard.

### Webhooks (V3.x)

- Emit-on-event wiring — D-311 ships the worker; producers (`createLead` → `enqueueDelivery`, etc.) are V3.x.
- Per-event-kind subscription enforcement at emit time.
- Retry-queue UI surfacing pending deliveries with future `next_retry_at`.
- Endpoint health metrics (success rate %, p95 latency).
- Webhook portal-style replay across all endpoints for one event_id.
- Per-endpoint outbound rate-limit.

### Retention + analytics (V3.x)

- Per-org `retention_days_*` overrides — global only.
- Tier-aware retention.
- Restore-from-archive — pruned rows are gone.
- Conversion rate as a sparkline (derived metric).
- Voice IQ adoption + plan-tier-mix as time series — needs org-history table.
- Streaming CSV for huge windows.
- Custom KPI builder UI.

### Real-estate (V3.x)

- Catalog bulk import (CSV / RERA registry fetch).
- Channel-partner-visible catalog.
- Lead-to-unit matching surface.
- Property image / brochure upload UI.
- Per-state-trigger workflows (e.g. notify CP on `held`).
- Property + Unit canvases (Deal canvas only in v3).
- Multi-lead → single-deal merge.
- Cross-workspace deal reassignment (D-122).

### Agents (V3.x)

- Real WhatsApp/email delivery on agent draft approve — `status='approved'` is the v3 endpoint.
- LLM-personalised drafts (T3 agent).
- Per-org token-budget cap on agent runs.
- Stale-lead Watcher (T0).
- Multi-agent orchestration.

### Hardening (V3.x — post-pen-test)

- Playwright `@perf` suite (load times under 100/500/1000 row scenarios).
- 100k-event load test.
- Sentry / OpenTelemetry instrumentation.
- Cloudflare WAF in front of Vercel.
- Hash-chained or off-system audit archive.
- Bug-bounty program launch.
- Hard-delete pipeline (GDPR Art 17).
- Multi-region failover.

### Foundation surfaces (V3.x — deferred from V1 plan)

- D-110 Property + Unit canvases.
- D-113 Custom views engine.
- D-118 Legal Auditor event bus.
- D-119 MIH event bus.
- D-120 Persona Creator V1.
- D-121 Cmd+K free-form NL.
- D-122 Cross-workspace lead reassign.
- D-124 Plan-tier LLM budget defaults.

---

## 7. How to verify v3 end-to-end

```sh
# 1. Apply migrations (one-time per environment)
cd <repo>
npx supabase link --project-ref <ref>
npx supabase db push      # applies all 6 v3 migrations idempotently

# 2. Wire env vars on Vercel (Production + Preview (v3))
#    - MFA_ENCRYPTION_KEY (openssl rand -hex 32)
#    - KV_REST_API_URL + KV_REST_API_TOKEN (provision Vercel KV first)
#    - STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (test for Preview, live for Production)

# 3. Run unit + integration tests
npm test                      # 1240/1240 vitest cases
npm run test:rls-audit        # live-DB RLS audit (needs SUPABASE_URL + SERVICE_ROLE_KEY + PUBLISHABLE_KEY)

# 4. Smoke test each surface per the per-directive runbook
#    - docs/runbooks/v3-mfa-deploy.md §4 (MFA enroll + verify)
#    - docs/runbooks/v3-rate-limit-deploy.md §3 (3 buckets via curl)
#    - docs/runbooks/v3-stripe-billing.md §6 (test card 4242)
#    - docs/runbooks/v3-webhook-delivery.md §3 (webhook.site smoke)

# 5. Tag is already pushed: v3.0 -> caf93a8
```

---

## 8. References

- Plan: [docs/plans/v3-plan-v1.md](plans/v3-plan-v1.md)
- v2 status (predecessor): [docs/V2_STATUS.md](V2_STATUS.md)
- Per-directive specs: [directives/300..330](../directives/)
- Per-directive PRs: [#42](https://github.com/builtrixlabs/AI_CRM/pull/42), [#43](https://github.com/builtrixlabs/AI_CRM/pull/43), [#44](https://github.com/builtrixlabs/AI_CRM/pull/44), [#45](https://github.com/builtrixlabs/AI_CRM/pull/45), [#46](https://github.com/builtrixlabs/AI_CRM/pull/46)
- Operator runbooks: [docs/runbooks/v3-*.md](runbooks/) + [demo-mode.md](runbooks/demo-mode.md)
- Security prep: [docs/security/](security/)

---

*v3.0 tagged 2026-05-10 on `v2` tip `caf93a8`. Operator pen-test + SOC 2 Type 1 engagement next.*
