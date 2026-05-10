import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * D-310 — webhook event handlers. Each handler is pure-ish: takes the
 * Stripe.Event (already verified + parsed by the route), runs DB writes,
 * appends an audit row. Idempotency is enforced upstream by the
 * stripe_event_log INSERT in the route handler — handlers never run twice
 * for the same event_id.
 */

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

type AuditCtx = {
  organization_id: string;
  client: SupabaseClient;
};

async function audit(
  ctx: AuditCtx,
  action: string,
  diff: Record<string, unknown>
): Promise<void> {
  await ctx.client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "stripe_webhook",
    organization_id: ctx.organization_id,
    workspace_id: null,
    table_name: "subscriptions",
    record_id: ctx.organization_id,
    action,
    diff,
  });
}

async function findOrgByCustomerId(
  client: SupabaseClient,
  customer_id: string
): Promise<string | null> {
  const { data } = await client
    .from("subscriptions")
    .select("organization_id")
    .eq("stripe_customer_id", customer_id)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

async function findOrgBySubscriptionId(
  client: SupabaseClient,
  subscription_id: string
): Promise<string | null> {
  const { data } = await client
    .from("subscriptions")
    .select("organization_id")
    .eq("stripe_subscription_id", subscription_id)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

function tierFromSubscription(sub: Stripe.Subscription): string | null {
  // Stripe puts the price under items.data[].price; we map via the price's
  // lookup_key (operator sets this to 'starter' / 'professional' / etc when
  // creating prices in the dashboard) OR fall back to nickname.
  const item = sub.items.data[0];
  if (!item) return null;
  return item.price.lookup_key ?? item.price.nickname ?? null;
}

function periodEndFromSubscription(sub: Stripe.Subscription): string | null {
  // As of Stripe API 2026-04-22, current_period_end moved from the
  // Subscription onto each Subscription Item. Take the first item's value.
  const item = sub.items.data[0];
  const ts =
    (item as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end ?? null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function statusFromStripe(s: Stripe.Subscription.Status): string {
  // Stripe statuses: incomplete, incomplete_expired, trialing, active,
  // past_due, canceled, unpaid, paused. Map to our subscriptions.status.
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "trial";
  }
}

export async function handleSubscriptionCreated(
  event: Stripe.Event,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const customer_id =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const org_id =
    (sub.metadata?.org_id as string | undefined) ??
    (await findOrgByCustomerId(client, customer_id));
  if (!org_id) return;

  const tier = tierFromSubscription(sub);
  const period_end = periodEndFromSubscription(sub);

  await client
    .from("subscriptions")
    .update({
      status: statusFromStripe(sub.status),
      ...(tier ? { plan_tier: tier } : {}),
      stripe_customer_id: customer_id,
      stripe_subscription_id: sub.id,
      current_period_end: period_end,
      grace_period_until: null,
      updated_at: new Date().toISOString(),
      updated_by: SYSTEM_UUID,
      updated_via: "stripe_webhook",
    })
    .eq("organization_id", org_id);

  await audit({ client, organization_id: org_id }, "subscription_stripe_created", {
    stripe_subscription_id: sub.id,
    tier,
    status: sub.status,
  });
}

export async function handleSubscriptionUpdated(
  event: Stripe.Event,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const org_id = await findOrgBySubscriptionId(client, sub.id);
  if (!org_id) return;

  const tier = tierFromSubscription(sub);
  const period_end = periodEndFromSubscription(sub);

  await client
    .from("subscriptions")
    .update({
      status: statusFromStripe(sub.status),
      ...(tier ? { plan_tier: tier } : {}),
      current_period_end: period_end,
      updated_at: new Date().toISOString(),
      updated_by: SYSTEM_UUID,
      updated_via: "stripe_webhook",
    })
    .eq("organization_id", org_id);

  await audit({ client, organization_id: org_id }, "subscription_stripe_updated", {
    stripe_subscription_id: sub.id,
    tier,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  });
}

export async function handleSubscriptionDeleted(
  event: Stripe.Event,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const org_id = await findOrgBySubscriptionId(client, sub.id);
  if (!org_id) return;

  await client
    .from("subscriptions")
    .update({
      status: "cancelled",
      stripe_subscription_id: null,
      current_period_end: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: SYSTEM_UUID,
      updated_via: "stripe_webhook",
    })
    .eq("organization_id", org_id);

  await audit({ client, organization_id: org_id }, "subscription_stripe_deleted", {
    stripe_subscription_id: sub.id,
  });
}

export async function handleInvoicePaid(
  event: Stripe.Event,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const inv = event.data.object as Stripe.Invoice;
  const customer_id =
    typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!customer_id) return;

  const org_id = await findOrgByCustomerId(client, customer_id);
  if (!org_id) return;

  await client
    .from("subscriptions")
    .update({
      status: "active",
      grace_period_until: null,
      updated_at: new Date().toISOString(),
      updated_by: SYSTEM_UUID,
      updated_via: "stripe_webhook",
    })
    .eq("organization_id", org_id);

  await audit({ client, organization_id: org_id }, "subscription_stripe_invoice_paid", {
    invoice_id: inv.id,
    amount: inv.amount_paid,
    currency: inv.currency,
  });
}

export async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const inv = event.data.object as Stripe.Invoice;
  const customer_id =
    typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!customer_id) return;

  const org_id = await findOrgByCustomerId(client, customer_id);
  if (!org_id) return;

  const grace_until = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  await client
    .from("subscriptions")
    .update({
      status: "past_due",
      grace_period_until: grace_until,
      updated_at: new Date().toISOString(),
      updated_by: SYSTEM_UUID,
      updated_via: "stripe_webhook",
    })
    .eq("organization_id", org_id);

  await audit(
    { client, organization_id: org_id },
    "subscription_stripe_payment_failed",
    {
      invoice_id: inv.id,
      amount: inv.amount_due,
      currency: inv.currency,
      attempt_count: inv.attempt_count,
      grace_until,
    }
  );
}
