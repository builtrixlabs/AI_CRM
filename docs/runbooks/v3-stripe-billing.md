# Runbook — D-310 Stripe billing deploy

**One-time setup** when wiring Stripe to a deployable environment. Steps cover both test-mode (Preview) and live-mode (Production).

---

## 1. Apply the migration

```sh
npx supabase link --project-ref bwumqahgwobwghlmzcrl
npx supabase db push
```

Migration: `20260510120200_subscription_plans_and_stripe.sql`. Adds:
- `subscription_plans` table (DB source-of-truth replacing the v2 `PLAN_TIERS` constants).
- `subscriptions.{stripe_customer_id, stripe_subscription_id, grace_period_until}` columns.
- `stripe_event_log` table (append-only via trigger; PK on `event_id` for idempotency).

The 4 tier rows (`starter`, `professional`, `enterprise`, `custom`) are seeded with `stripe_price_id = NULL`. Step 3 wires them.

## 2. Create products + prices in Stripe

For each environment (test / live):

1. Stripe Dashboard → **Products** → **Add product**.
2. Create one product per tier you want self-serve checkout for: `Builtrix Starter`, `Builtrix Professional`, `Builtrix Enterprise`. (`custom` stays on the request-via-ticket path.)
3. For each product, add a **monthly recurring price**. Note the `price_xxx` ID after saving.
4. **Critically**: under each price, set the **lookup_key** to `starter`, `professional`, or `enterprise` (matches our `subscription_plans.tier` PK). The webhook handler reads `price.lookup_key` to derive the new plan tier.

## 3. Wire price IDs to subscription_plans

Run via Supabase SQL editor:

```sql
update public.subscription_plans
   set stripe_price_id = 'price_test_starter_xxx'
 where tier = 'starter';
update public.subscription_plans
   set stripe_price_id = 'price_test_pro_xxx'
 where tier = 'professional';
update public.subscription_plans
   set stripe_price_id = 'price_test_enterprise_xxx'
 where tier = 'enterprise';
```

Run separately for test and live. Different `price_xxx` per environment.

## 4. Set Vercel env vars

| Name | Value | Scope |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Preview (v3) |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Production |
| `STRIPE_WEBHOOK_SECRET` | (filled in Step 5) | Preview + Production |
| `NEXT_PUBLIC_APP_URL` | `https://crm.builtrix.com` (or preview URL) | per scope |

Redeploy after saving — env vars don't propagate to running deployments.

## 5. Add the webhook endpoint

Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**.

| Field | Value |
|---|---|
| URL | `https://<your-vercel-url>/api/stripe/webhook` |
| API version | Use the same as `STRIPE_API_VERSION` in `src/lib/billing/stripe.ts` (currently `2026-04-22.dahlia`) |
| Events | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` |

After creating, click "Reveal" on the signing secret → `whsec_xxx`. Paste into `STRIPE_WEBHOOK_SECRET` on Vercel. **Redeploy.**

Repeat for live mode separately.

## 6. Smoke test the full loop

Pre-req: A test org with at least one user; super_admin to verify DB state.

### 6.1 Self-serve checkout

1. Sign in as the org's user (org_admin role) → `/admin/billing`.
2. Click **"Upgrade to Professional"** button.
3. Browser redirects to `https://checkout.stripe.com/...` with a Stripe-hosted checkout form.
4. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any 3-digit CVC.
5. Submit → redirect back to `/admin/billing?stripe=success`.
6. Verify DB:
   ```sql
   select status, plan_tier, stripe_customer_id, stripe_subscription_id,
          current_period_end
   from subscriptions
   where organization_id = '<org-uuid>';
   -- Expect: status='active', plan_tier='professional',
   --         stripe_customer_id='cus_xxx', stripe_subscription_id='sub_xxx'
   ```
7. Verify webhook log:
   ```sql
   select event_id, event_type, received_at
   from stripe_event_log
   order by received_at desc limit 5;
   -- Expect: customer.subscription.created followed by invoice.paid
   ```

### 6.2 Failed payment

1. Stripe Dashboard → **Customers** → find the test customer → **Subscriptions** → **Cancel and refund**.
2. Or simulate via CLI: `stripe trigger invoice.payment_failed`.
3. Verify DB:
   ```sql
   select status, grace_period_until from subscriptions
   where organization_id = '<org-uuid>';
   -- Expect: status='past_due', grace_period_until set ~30 days ahead
   ```

### 6.3 Self-serve billing portal

1. Back on `/admin/billing`, click **"Manage billing"**.
2. Browser redirects to Stripe Billing Portal.
3. Verify the portal shows the current subscription, update-card option, invoice history.

### 6.4 Replay protection

1. Stripe Dashboard → **Webhooks** → click your endpoint → click any past delivery → **"Resend"**.
2. Verify Vercel logs: `replay: true` in the response, no DB writes performed twice.

## 7. Audit-log query

```sql
select action, created_at, diff
from audit_log
where action like 'subscription_stripe_%'
order by created_at desc limit 20;
```

Expect rows for `subscription_stripe_created`, `_updated`, `_invoice_paid`, `_payment_failed`, `_deleted`. Each carries `stripe_subscription_id` or `invoice_id` in `diff`.

## 8. Rollback

D-310 is **safely rollback-able** at the code layer:

1. Revert the deploy on Vercel.
2. Webhook deliveries to a 5xx route will retry — Stripe gives you ~3 days of retries to fix and re-deploy.
3. The old "request plan upgrade" ticket flow keeps working (it was never removed — D-310 is additive).
4. No DB cleanup needed; the new columns + tables sit dormant.

If you must clean the schema:
```sql
drop table if exists public.stripe_event_log cascade;
alter table public.subscriptions drop column if exists grace_period_until;
alter table public.subscriptions drop column if exists stripe_subscription_id;
alter table public.subscriptions drop column if exists stripe_customer_id;
drop table if exists public.subscription_plans cascade;
```

But this should be unnecessary — additive migrations are forward-safe.

## 9. Operator follow-ups (post-merge)

- [ ] `npx supabase db push` to apply the migration to AI CRM Supabase prod.
- [ ] Stripe Dashboard: create products + prices in **test** mode first, set `lookup_key` per tier.
- [ ] SQL UPDATE to wire `subscription_plans.stripe_price_id` for test prices.
- [ ] Add webhook endpoint in Stripe (test mode), copy signing secret, set `STRIPE_WEBHOOK_SECRET` on Vercel Preview, redeploy.
- [ ] Smoke test §6 against Preview.
- [ ] Repeat for **live** mode → Production. Set live `STRIPE_SECRET_KEY` + live `STRIPE_WEBHOOK_SECRET`.
- [ ] Smoke test §6 against Production with a real card (or use Stripe's "live mode test" once the account is fully verified).

## 10. Known gaps (V3.x)

Per the directive's non-goals:

- **No auto-suspend cron when `grace_period_until` expires** — operator clicks Suspend manually. V3.x adds an Inngest cron.
- **No plan-CRUD UI** — `subscription_plans` is editable via SQL only. UI lands V3.x.
- **No Stripe Tax integration** — manually report GST/VAT.
- **No proration preview** — Stripe handles it server-side, but the UI doesn't show "you'll be charged ₹X today" before the user clicks confirm.
- **No annual billing** — monthly only.
- **`custom` tier still uses request-via-ticket** — by design.

## 11. References

- Spec: [directives/310-stripe-billing.md](../../directives/310-stripe-billing.md)
- Plan: [docs/plans/v3-plan-v1.md](../plans/v3-plan-v1.md) §4 D-310
- Library: [src/lib/billing/stripe.ts](../../src/lib/billing/stripe.ts), [plans.ts](../../src/lib/billing/plans.ts), [webhook-handlers.ts](../../src/lib/billing/webhook-handlers.ts)
- Webhook receiver: [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts)
- Migration: [supabase/migrations/20260510120200_subscription_plans_and_stripe.sql](../../supabase/migrations/20260510120200_subscription_plans_and_stripe.sql)
- Stripe API ref: https://stripe.com/docs/api (anchor `2026-04-22.dahlia`)
