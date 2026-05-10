-- D-310 — Stripe billing integration. Three additive concerns in one
-- migration: subscription_plans (DB-backed plan registry), subscriptions
-- Stripe linkage columns, and stripe_event_log for webhook idempotency.

-- ── 1. subscription_plans — replaces hardcoded PLAN_TIERS constants ──

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  tier                   text PRIMARY KEY,
  display_name           text NOT NULL,
  monthly_price_inr      integer,
  monthly_price_usd      integer,
  stripe_price_id        text,
  max_users              integer NOT NULL,
  max_active_properties  integer NOT NULL,
  max_bookings_per_month integer NOT NULL,
  max_channel_partners   integer NOT NULL,
  features               jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_plans IS
  'D-310 — DB source-of-truth for plan tiers. Seeded from v2 PLAN_TIERS constants. stripe_price_id wired per environment via SQL UPDATE.';

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Reference data — every authenticated user can read.
CREATE POLICY subscription_plans_authenticated_select
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Super-admin only writes.
CREATE POLICY subscription_plans_super_admin_insert
  ON public.subscription_plans
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_super_admin());

CREATE POLICY subscription_plans_super_admin_update
  ON public.subscription_plans
  FOR UPDATE TO authenticated
  USING (public.app_is_super_admin())
  WITH CHECK (public.app_is_super_admin());

CREATE POLICY subscription_plans_super_admin_delete
  ON public.subscription_plans
  FOR DELETE TO authenticated
  USING (public.app_is_super_admin());

-- Seed: the 4 tiers from src/lib/platform/plan-tiers.ts. Idempotent insert
-- via ON CONFLICT.
INSERT INTO public.subscription_plans
  (tier, display_name, monthly_price_inr, max_users, max_active_properties,
   max_bookings_per_month, max_channel_partners, features)
VALUES
  ('starter', 'Starter', 0, 5, 1, 50, 5,
   '["Lead canvas","WhatsApp inbound","Basic dashboards"]'::jsonb),
  ('professional', 'Professional', 14999, 25, 10, 500, 50,
   '["Everything in Starter","Voice IQ integration","Custom dashboards + tables","Stale-lead watcher"]'::jsonb),
  ('enterprise', 'Enterprise', 49999, 999, 999, 9999, 999,
   '["Everything in Professional","SSO/SAML","Dedicated infra","SLA"]'::jsonb),
  ('custom', 'Custom', NULL, 9999, 9999, 99999, 9999,
   '["Negotiated"]'::jsonb)
ON CONFLICT (tier) DO NOTHING;

-- ── 2. subscriptions — Stripe linkage columns ──

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS grace_period_until     timestamptz;

COMMENT ON COLUMN public.subscriptions.stripe_customer_id IS
  'D-310 — Stripe Customer ID (cus_xxx). NULL until first checkout.';
COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS
  'D-310 — Stripe Subscription ID (sub_xxx). NULL until first paid checkout.';
COMMENT ON COLUMN public.subscriptions.grace_period_until IS
  'D-310 — set by invoice.payment_failed; cleared by invoice.paid.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── 3. stripe_event_log — webhook idempotency ──

CREATE TABLE IF NOT EXISTS public.stripe_event_log (
  event_id    text PRIMARY KEY,
  event_type  text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload     jsonb NOT NULL
);

COMMENT ON TABLE public.stripe_event_log IS
  'D-310 — append-only record of received Stripe webhook events. PK on event_id ensures idempotency on Stripe retries.';

ALTER TABLE public.stripe_event_log ENABLE ROW LEVEL SECURITY;

-- Super-admin read; insert via service-role only (no policy = no
-- authenticated INSERT path).
CREATE POLICY stripe_event_log_super_admin_select
  ON public.stripe_event_log
  FOR SELECT TO authenticated
  USING (public.app_is_super_admin());

-- Append-only via trigger — same pattern as audit_log (D-001).
CREATE OR REPLACE FUNCTION public.stripe_event_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stripe_event_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS stripe_event_log_no_update ON public.stripe_event_log;
CREATE TRIGGER stripe_event_log_no_update
  BEFORE UPDATE ON public.stripe_event_log
  FOR EACH ROW EXECUTE FUNCTION public.stripe_event_log_block_mutation();

DROP TRIGGER IF EXISTS stripe_event_log_no_delete ON public.stripe_event_log;
CREATE TRIGGER stripe_event_log_no_delete
  BEFORE DELETE ON public.stripe_event_log
  FOR EACH ROW EXECUTE FUNCTION public.stripe_event_log_block_mutation();

DROP TRIGGER IF EXISTS stripe_event_log_no_truncate ON public.stripe_event_log;
CREATE TRIGGER stripe_event_log_no_truncate
  BEFORE TRUNCATE ON public.stripe_event_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.stripe_event_log_block_mutation();

NOTIFY pgrst, 'reload schema';
