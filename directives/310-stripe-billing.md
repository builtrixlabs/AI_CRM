# Directive 310 — Stripe billing integration

**Kind:** feature (V3 / Phase B — billing + delivery + observability; opens Phase B)
**Status:** AUTHORIZED — operator approved 2026-05-10
**Generated:** 2026-05-10
**Branch target:** `v3` (carried in PR [apps#42](https://github.com/builtrixlabs/AI_CRM/pull/42))
**Source:** `docs/plans/v3-plan-v1.md` §4 D-310
**Builds on:** D-203 (subscriptions table + suspend/cancel/reactivate), D-201 (`/admin/billing` page), D-302 (force-sign-out on suspend)

---

## Problem

v2 ships plan tiers as **hardcoded constants** in `src/lib/platform/plan-tiers.ts` and a **request-via-ticket** upgrade flow — org-admin clicks "Request plan upgrade" → support ticket is filed → super-admin manually flips `subscriptions.plan_tier` from `/platform/subscriptions/[id]`. Nothing is actually charged. Nothing happens automatically when payment fails.

D-310 plugs Stripe into this loop:

- **Self-serve checkout**: org-admin clicks "Upgrade to Professional" → Stripe Checkout session → user pays → webhook fires → DB updated automatically.
- **Self-serve billing portal**: "Manage billing" button → Stripe Billing Portal session → user updates card / downloads invoices / cancels.
- **Source-of-truth migration**: hardcoded `PLAN_TIERS` constants → DB-backed `subscription_plans` table seeded with the existing 4 tiers + their Stripe price IDs.
- **Failed-payment handling**: `invoice.payment_failed` webhook sets `subscriptions.grace_period_until = now() + 30 days`; after grace expires (cron in V3.x or manual super-admin action), `suspendOrg` fires (which triggers D-302's force-sign-out).
- **The request-via-ticket path stays** as a fallback for `custom`-tier negotiations — additive, not replacing.

## Success criteria (production target 80/90)

### Schema (additive)

- [ ] **AC-1** Migration `supabase/migrations/<ts>_subscription_plans.sql`:
  - `subscription_plans(tier text PRIMARY KEY, display_name text NOT NULL, monthly_price_inr int, monthly_price_usd int, stripe_price_id text, max_users int, max_active_properties int, max_bookings_per_month int, max_channel_partners int, features jsonb NOT NULL DEFAULT '[]', deleted_at timestamptz)` — DB source-of-truth for tier definitions.
  - Seed: rows for `starter`, `professional`, `enterprise`, `custom` with values mirroring the existing constants. `stripe_price_id` left NULL — operator wires per environment via `/platform/settings/secrets`-style flow OR direct DB UPDATE.
  - RLS: super-admin write, all-authenticated read (it's tier *reference* data, not tenant data).
- [ ] **AC-2** Migration `supabase/migrations/<ts>_subscriptions_stripe.sql`:
  - `subscriptions` adds `stripe_customer_id text`, `stripe_subscription_id text`, `grace_period_until timestamptz`.
  - All nullable, all additive. RLS unchanged.
  - Helpful index on `stripe_subscription_id` (webhook lookups).
- [ ] **AC-3** Migration `supabase/migrations/<ts>_stripe_event_log.sql`:
  - `stripe_event_log(event_id text PRIMARY KEY, event_type text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL)` — webhook idempotency. Append-only via `BEFORE UPDATE/DELETE` trigger (same precedent as D-001 `audit_log`).
  - Super-admin read; insert via service-role only.

### Stripe SDK wrapper

- [ ] **AC-4** New module `src/lib/billing/stripe.ts`:
  - Single Stripe client singleton initialized from `STRIPE_SECRET_KEY` env. Throws at first use if missing in production.
  - `createCheckoutSession({ org_id, customer_id?, price_id, return_url })` → `{ url }` — used by `/admin/billing` upgrade button.
  - `createBillingPortalSession({ customer_id, return_url })` → `{ url }` — used by "Manage billing" button.
  - `retrieveSubscription(stripe_subscription_id)` → typed shape — used by webhook handlers when payload is sparse.
  - `verifyWebhookSignature(rawBody, signature)` — verifies via `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. Throws on mismatch.
  - All functions accept an optional injected `stripe` client for tests.

- [ ] **AC-5** New module `src/lib/billing/plans.ts`:
  - `listPlans()` — reads `subscription_plans` (live, not cached for v3 MVP — admin-edits should reflect immediately).
  - `getPlan(tier)` — single-row lookup; falls back to the v2 hardcoded constant if the DB row is missing (defense-in-depth during the migration).
  - Type `PlanRow` exported.

### Webhook receiver

- [ ] **AC-6** New route `/api/stripe/webhook` (`src/app/api/stripe/webhook/route.ts`):
  - Reads raw request body (NOT `req.json()`) for signature verification.
  - Calls `verifyWebhookSignature(rawBody, header)` — returns 400 on mismatch.
  - Idempotency: INSERT into `stripe_event_log` with `ON CONFLICT (event_id) DO NOTHING`. If the conflict fires (duplicate), return 200 immediately without re-processing.
  - Dispatches by `event.type`:
    - `customer.subscription.created` → `handleSubscriptionCreated`
    - `customer.subscription.updated` → `handleSubscriptionUpdated`
    - `customer.subscription.deleted` → `handleSubscriptionDeleted`
    - `invoice.paid` → `handleInvoicePaid`
    - `invoice.payment_failed` → `handleInvoicePaymentFailed`
  - Unknown event types: log + 200 (Stripe expects 200 for any non-fatal response).
  - Wrapped with `withApiAudit({ permission: "billing.webhook" })` so each delivery audits.

### Webhook handlers

- [ ] **AC-7** `handleSubscriptionCreated`:
  - Looks up `subscriptions` by `stripe_customer_id` (set during Checkout via metadata).
  - Updates: `status='active'`, `plan_tier=<from price.lookup_key OR plan_id>`, `stripe_subscription_id`, `current_period_end`.
  - Audit row: `subscription_stripe_created`.

- [ ] **AC-8** `handleSubscriptionUpdated`:
  - Same lookup. Updates `status`, `plan_tier`, `current_period_end` to whatever Stripe says.
  - If Stripe says `cancel_at_period_end=true`, leave status as 'active' but set `current_period_end` — D-310 doesn't auto-cancel until `customer.subscription.deleted` fires.
  - Audit `subscription_stripe_updated` with `diff: { from, to }`.

- [ ] **AC-9** `handleSubscriptionDeleted`:
  - Updates `status='cancelled'`, clears `stripe_subscription_id`.
  - Calls `cancelOrg(...)` (existing D-203 helper) which sets the 30-day grace period_end. Then `reactivateOrg`/`suspendOrg` works the rest of the way.
  - Audit `subscription_stripe_deleted`.

- [ ] **AC-10** `handleInvoicePaid`:
  - Clears `subscriptions.grace_period_until`.
  - If org was on grace (status='past_due'), flips back to 'active'.
  - Audit `subscription_stripe_invoice_paid` with `diff: { amount, currency }`.

- [ ] **AC-11** `handleInvoicePaymentFailed`:
  - Sets `subscriptions.status='past_due'`, `grace_period_until=now() + interval '30 days'`.
  - Does NOT auto-suspend. The actual suspension is operator-driven (super-admin clicks Suspend) or a cron in V3.x.
  - Audit `subscription_stripe_payment_failed` with `diff: { amount, attempt_count }`.

### UI surface

- [ ] **AC-12** `/admin/billing/page.tsx` extended:
  - Existing "Request plan upgrade" form stays — fallback for `custom` tier or operators not wired to Stripe.
  - **NEW**: per non-current tier, an "Upgrade to <tier>" button (or "Downgrade to <tier>" for lower tiers) → posts to a new `upgradeAction` server action.
  - **NEW**: "Manage billing" button if `subscriptions.stripe_customer_id IS NOT NULL` → `billingPortalAction` server action.
  - Banner: "30-day grace period — payment by <date>" if `grace_period_until IS NOT NULL`.
  - Existing tier-table read-out reads from `getPlan(tier)` (DB-backed) instead of `PLAN_TIERS[tier]`.

- [ ] **AC-13** New server actions:
  - `upgradeAction(target_tier)` — auth-checked, calls `createCheckoutSession`, redirects to Stripe.
  - `billingPortalAction()` — auth-checked, calls `createBillingPortalSession`, redirects to Stripe.
  - Both return `{ ok: true; redirect_url }` on success or the existing discriminated-union error shape.

### Configuration

- [ ] **AC-14** New env vars documented in `.env.example`:
  - `STRIPE_SECRET_KEY` — server-only Stripe API key (REQUIRED in production).
  - `STRIPE_WEBHOOK_SECRET` — Stripe-issued signing secret for the webhook endpoint (REQUIRED in production).
  - `STRIPE_PUBLISHABLE_KEY` — client-safe (currently unused — placeholder for future Stripe.js integration).
  - All three optional in dev; missing-key throws lazily on first call.

### Tests (TDD)

- [ ] **AC-15** `tests/lib/billing/stripe.test.ts` (new):
  - `verifyWebhookSignature` accepts valid signatures and rejects tampered ones (using Stripe's test-event format).
  - `createCheckoutSession` builds the right `mode='subscription'` payload with metadata.
  - `retrieveSubscription` surfaces null on Stripe 404.
- [ ] **AC-16** `tests/lib/billing/plans.test.ts` (new):
  - `getPlan` returns DB row when present, falls back to constant when absent.
  - `listPlans` filters out `deleted_at IS NOT NULL`.
- [ ] **AC-17** `tests/app/api/stripe/webhook.test.ts` (new):
  - Signature mismatch → 400.
  - Replay (same event_id twice) → 200 both times, handler runs once.
  - Unknown event type → 200, no side effects.
  - Each of the 5 handled types: assert the right DB updates fire (mocked Supabase).
- [ ] **AC-18** Coverage on touched files: ≥80% lines / ≥90% branches.
- [ ] **AC-19** Gate-4 security scan: 0 CRITICAL after auto-fix loop. HIGH/MED/LOW logged.

## Non-goals (deferred to V3.x)

- **Auto-suspension cron when grace expires** — v3 MVP marks past_due; operator clicks Suspend manually. V3.x adds an Inngest cron.
- **Plan-CRUD UI** — `subscription_plans` is editable via SQL only for v3 MVP. UI lands V3.x.
- **Per-org custom-pricing overrides** — `custom` tier still uses the request-via-ticket fallback.
- **Annual billing** — monthly only.
- **Proration on tier changes** — Stripe handles this automatically; the UI doesn't expose proration preview. V3.x.
- **Tax handling (GST/VAT)** — Stripe Tax integration is V3.x.
- **Refund flow** — operator handles refunds in Stripe dashboard manually.
- **Invoice email customization** — uses Stripe defaults.
- **Webhook retry queue** — Stripe's own retry handles this; no app-side retry queue.

## Stack

- **New runtime dep:** `stripe` (~600KB, official Stripe Node SDK). Edge-runtime: webhook receiver runs on `nodejs` runtime explicitly to access raw body easily. The SDK wrapper itself is Node-only; if any client component ever needs Stripe, it'll get its own thin browser-safe wrapper (V3.x).
- **No new dev deps.**
- **Webhook receiver runs at `runtime: nodejs`** (not edge) per the route handler header; gives access to raw body via `req.text()` cleanly.

## Learned patterns applied

- **`hmac-flat-timing-verification`** — webhook signature verify uses `stripe.webhooks.constructEvent` which internally does timing-safe HMAC compare.
- **`webhook-dedup-via-jsonb-key`** — adapted: `stripe_event_log.event_id` is a real PK unique constraint (Stripe gives a UUID, no need for the jsonb-fallback pattern v2 used for WhatsApp's quasi-UUID `wamid`).
- **`append-only-via-trigger`** — `stripe_event_log` blocks UPDATE/DELETE/TRUNCATE.
- **`single-llm-seam-via-gateway`** — `src/lib/billing/stripe.ts` is the only seam allowed to import the `stripe` SDK; future code grepped to confirm.
- **`server-action-result-discriminated-union`** — `upgradeAction` / `billingPortalAction` return the same shape as v2 D-203 actions.

## Authority

- Constitution V — **Bounded Authority** (billing is the literal money path; auth boundary applies).
- Supersedes: D-203 § AC-7 ("hardcoded `PLAN_TIERS` constants").
- Supersedes (partially): D-201's "Request plan upgrade" — kept as fallback, no longer the primary path for non-`custom` tiers.

## Operator follow-ups (post-merge)

- [ ] Stripe dashboard: create products + prices for `starter`, `professional`, `enterprise`. Note the `price_xxx` IDs.
- [ ] Update `subscription_plans.stripe_price_id` per-row (SQL UPDATE) — production AND test environments.
- [ ] Stripe dashboard → Webhooks → add endpoint `https://crm.builtrix.com/api/stripe/webhook`, subscribe to: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` on Vercel.
- [ ] Set `STRIPE_SECRET_KEY` (test mode for Preview, live mode for Production) on Vercel.
- [ ] Smoke test per `docs/runbooks/v3-stripe-billing.md` — Stripe CLI replay against Preview.
- [ ] Document the test-mode → live-mode switch in V3.x backlog.
