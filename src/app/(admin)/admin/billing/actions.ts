"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { requestPlanUpgrade } from "@/lib/admin/billing";
import { getPlan } from "@/lib/billing/plans";
import {
  createBillingPortalSession,
  createCheckoutSession,
} from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PlanTier } from "@/lib/platform/plan-tiers";

export type RequestUpgradeResult =
  | { ok: true; ticket_id: string }
  | { ok: false; error: "permission" | "validation" | "internal"; message?: string };

export async function requestUpgradeAction(
  target_tier: string,
  reason: string
): Promise<RequestUpgradeResult> {
  const user = await getCurrentUser();
  if (!user || !user.org_id) return { ok: false, error: "permission" };
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("billing:view")) {
    return { ok: false, error: "permission" };
  }
  const r = await requestPlanUpgrade({
    organization_id: user.org_id,
    user_id: user.user.id,
    target_tier: target_tier as PlanTier,
    reason,
  });
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "invalid_tier" || r.error === "reason_required"
          ? "validation"
          : "internal",
      message: r.error,
    };
  }
  revalidatePath("/admin/billing");
  return { ok: true, ticket_id: r.ticket_id };
}

export type StripeActionResult =
  | { ok: true }
  | { ok: false; error: "permission" | "configuration" | "internal"; message?: string };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

function returnUrl(): string {
  return `${APP_URL || "https://crm.builtrix.com"}/admin/billing`;
}

/**
 * D-310 — start a Stripe Checkout session for the target tier and
 * redirect the user to Stripe. The webhook handler will update the DB
 * once payment succeeds.
 */
export async function upgradeToTierAction(
  target_tier: string
): Promise<StripeActionResult> {
  const user = await getCurrentUser();
  if (!user || !user.org_id) return { ok: false, error: "permission" };
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("billing:view")) {
    return { ok: false, error: "permission" };
  }

  const plan = await getPlan(target_tier as PlanTier);
  if (!plan.stripe_price_id) {
    return {
      ok: false,
      error: "configuration",
      message:
        "This tier isn't wired to a Stripe price yet. Use 'Request plan upgrade' or contact support.",
    };
  }

  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  let session;
  try {
    session = await createCheckoutSession({
      org_id: user.org_id,
      customer_id:
        (sub as { stripe_customer_id: string | null } | null)
          ?.stripe_customer_id ?? null,
      customer_email: user.user.email,
      price_id: plan.stripe_price_id,
      return_url: returnUrl(),
    });
  } catch (err) {
    return {
      ok: false,
      error: "internal",
      message: err instanceof Error ? err.message : "checkout_failed",
    };
  }

  redirect(session.url);
}

/**
 * D-310 — open Stripe Billing Portal for self-serve card update,
 * invoice download, cancellation, etc.
 */
export async function billingPortalAction(): Promise<StripeActionResult> {
  const user = await getCurrentUser();
  if (!user || !user.org_id) return { ok: false, error: "permission" };
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("billing:view")) {
    return { ok: false, error: "permission" };
  }

  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", user.org_id)
    .maybeSingle();

  const customer_id = (sub as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;
  if (!customer_id) {
    return {
      ok: false,
      error: "configuration",
      message:
        "No Stripe customer linked to this org yet. Upgrade to a paid tier first.",
    };
  }

  let session;
  try {
    session = await createBillingPortalSession({
      customer_id,
      return_url: returnUrl(),
    });
  } catch (err) {
    return {
      ok: false,
      error: "internal",
      message: err instanceof Error ? err.message : "portal_failed",
    };
  }

  redirect(session.url);
}
