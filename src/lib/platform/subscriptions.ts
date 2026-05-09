import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PlanTier } from "./plan-tiers";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";

export type OrgSubscriptionRow = {
  organization_id: string;
  slug: string;
  name: string;
  plan_tier: PlanTier;
  status: SubscriptionStatus;
  starts_at: string;
  current_period_end: string | null;
};

const ALL_TIERS: ReadonlyArray<PlanTier> = [
  "starter",
  "professional",
  "enterprise",
  "custom",
];

const ALL_STATUSES: ReadonlyArray<SubscriptionStatus> = [
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
];

export function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === "string" && (ALL_TIERS as ReadonlyArray<string>).includes(v);
}

export async function listOrgSubscriptions(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<OrgSubscriptionRow[]> {
  const orgsRes = await client
    .from("organizations")
    .select("id, slug, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (orgsRes.error || !orgsRes.data) return [];

  const subsRes = await client
    .from("subscriptions")
    .select("organization_id, plan_tier, status, starts_at, current_period_end")
    .is("deleted_at", null);

  const byOrg = new Map<
    string,
    {
      plan_tier: PlanTier;
      status: SubscriptionStatus;
      starts_at: string;
      current_period_end: string | null;
    }
  >();
  if (!subsRes.error && subsRes.data) {
    for (const r of subsRes.data as Array<{
      organization_id: string;
      plan_tier: string;
      status: string;
      starts_at: string;
      current_period_end: string | null;
    }>) {
      byOrg.set(r.organization_id, {
        plan_tier: isPlanTier(r.plan_tier) ? r.plan_tier : "starter",
        status: ALL_STATUSES.includes(r.status as SubscriptionStatus)
          ? (r.status as SubscriptionStatus)
          : "active",
        starts_at: r.starts_at,
        current_period_end: r.current_period_end,
      });
    }
  }

  return (
    orgsRes.data as Array<{ id: string; slug: string; name: string }>
  ).map((o) => {
    const sub = byOrg.get(o.id);
    return {
      organization_id: o.id,
      slug: o.slug,
      name: o.name,
      plan_tier: sub?.plan_tier ?? "starter",
      status: sub?.status ?? "active",
      starts_at: sub?.starts_at ?? new Date().toISOString(),
      current_period_end: sub?.current_period_end ?? null,
    };
  });
}

type WriteCtx = { actor_id: string; organization_id: string };
type WriteResult = { ok: true } | { ok: false; error: string };

async function audit(
  client: SupabaseClient,
  ctx: WriteCtx,
  action: string,
  diff: Record<string, unknown>
): Promise<void> {
  await client.from("audit_log").insert({
    actor_id: ctx.actor_id,
    actor_type: "user",
    actor_role: "super_admin",
    organization_id: ctx.organization_id,
    workspace_id: null,
    table_name: "subscriptions",
    record_id: ctx.organization_id,
    action,
    diff,
  });
}

export async function changePlanTier(
  ctx: WriteCtx,
  new_tier: PlanTier,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  if (!isPlanTier(new_tier)) {
    return { ok: false, error: "invalid_tier" };
  }
  const { error } = await client
    .from("subscriptions")
    .update({
      plan_tier: new_tier,
      updated_at: new Date().toISOString(),
      updated_by: ctx.actor_id,
      updated_via: "manual",
    })
    .eq("organization_id", ctx.organization_id);
  if (error) return { ok: false, error: error.message };
  await audit(client, ctx, "plan_tier_changed", { new_tier });
  return { ok: true };
}

export async function suspendOrg(
  ctx: WriteCtx,
  reason: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  if (!reason || reason.trim().length < 3) {
    return { ok: false, error: "reason_required" };
  }
  const { error } = await client
    .from("subscriptions")
    .update({
      status: "suspended",
      updated_at: new Date().toISOString(),
      updated_by: ctx.actor_id,
      updated_via: "manual",
    })
    .eq("organization_id", ctx.organization_id);
  if (error) return { ok: false, error: error.message };
  await audit(client, ctx, "subscription_suspended", { reason: reason.trim() });
  return { ok: true };
}

export async function cancelOrg(
  ctx: WriteCtx,
  reason: string,
  graceDays = 30,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  if (!reason || reason.trim().length < 3) {
    return { ok: false, error: "reason_required" };
  }
  const periodEnd = new Date(
    Date.now() + graceDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const { error } = await client
    .from("subscriptions")
    .update({
      status: "cancelled",
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
      updated_by: ctx.actor_id,
      updated_via: "manual",
    })
    .eq("organization_id", ctx.organization_id);
  if (error) return { ok: false, error: error.message };
  await audit(client, ctx, "subscription_cancelled", {
    reason: reason.trim(),
    grace_days: graceDays,
    period_end: periodEnd,
  });
  return { ok: true };
}

export async function reactivateOrg(
  ctx: WriteCtx,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  const { error } = await client
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: null,
      updated_at: new Date().toISOString(),
      updated_by: ctx.actor_id,
      updated_via: "manual",
    })
    .eq("organization_id", ctx.organization_id);
  if (error) return { ok: false, error: error.message };
  await audit(client, ctx, "subscription_reactivated", {});
  return { ok: true };
}
