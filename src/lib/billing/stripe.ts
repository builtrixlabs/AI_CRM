import Stripe from "stripe";

/**
 * D-310 — single seam for the Stripe SDK. Anything outside this module
 * importing `stripe` directly is a violation; future ESLint rule will
 * enforce.
 *
 * Production requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET; missing
 * keys throw lazily on first use (not at module load) so dev / tests
 * can run without Stripe configured.
 */

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

let _stripeSingleton: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_stripeSingleton) return _stripeSingleton;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("STRIPE_SECRET_KEY is required in production");
    }
    throw new Error(
      "STRIPE_SECRET_KEY missing — set it in .env.local for dev"
    );
  }
  _stripeSingleton = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  return _stripeSingleton;
}

/** Test-only — reset the singleton between tests with different env. */
export function _resetStripeClient(): void {
  _stripeSingleton = null;
}

export type CheckoutSessionInput = {
  org_id: string;
  customer_id: string | null;
  customer_email: string;
  price_id: string;
  return_url: string;
};

export async function createCheckoutSession(
  input: CheckoutSessionInput,
  client: Pick<Stripe, "checkout"> = getStripeClient()
): Promise<{ url: string; session_id: string }> {
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: input.price_id, quantity: 1 }],
    customer: input.customer_id ?? undefined,
    customer_email: input.customer_id ? undefined : input.customer_email,
    metadata: { org_id: input.org_id },
    subscription_data: { metadata: { org_id: input.org_id } },
    success_url: `${input.return_url}?stripe=success`,
    cancel_url: `${input.return_url}?stripe=cancelled`,
  });
  if (!session.url) {
    throw new Error("Stripe Checkout returned no URL");
  }
  return { url: session.url, session_id: session.id };
}

export type BillingPortalInput = {
  customer_id: string;
  return_url: string;
};

export async function createBillingPortalSession(
  input: BillingPortalInput,
  client: Pick<Stripe, "billingPortal"> = getStripeClient()
): Promise<{ url: string }> {
  const session = await client.billingPortal.sessions.create({
    customer: input.customer_id,
    return_url: input.return_url,
  });
  return { url: session.url };
}

export async function retrieveSubscription(
  stripe_subscription_id: string,
  client: Pick<Stripe, "subscriptions"> = getStripeClient()
): Promise<Stripe.Subscription | null> {
  try {
    return await client.subscriptions.retrieve(stripe_subscription_id);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Verifies a Stripe webhook signature and returns the parsed event.
 * Throws on signature mismatch (caller surfaces 400). Uses the official
 * `stripe.webhooks.constructEvent`, which does timing-safe HMAC compare.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  client: Pick<Stripe, "webhooks"> = getStripeClient()
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("STRIPE_WEBHOOK_SECRET is required in production");
    }
    throw new Error(
      "STRIPE_WEBHOOK_SECRET missing — set it in .env.local for dev"
    );
  }
  return client.webhooks.constructEvent(rawBody, signature, secret);
}
