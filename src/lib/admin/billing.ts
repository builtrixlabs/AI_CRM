import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PLAN_TIERS, type PlanTier } from "@/lib/platform/plan-tiers";

export type BillingSnapshot = {
  plan_tier: PlanTier;
  status: string;
  current_period_end: string | null;
  usage: {
    active_users: number;
    workspaces: number;
    leads_30d: number;
  };
  limits: typeof PLAN_TIERS[PlanTier];
};

const ALL_TIERS: ReadonlyArray<PlanTier> = [
  "starter",
  "professional",
  "enterprise",
  "custom",
];

function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === "string" && (ALL_TIERS as ReadonlyArray<string>).includes(v);
}

export async function getBillingSnapshot(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<BillingSnapshot> {
  const subRes = await client
    .from("subscriptions")
    .select("plan_tier, status, current_period_end")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  const sub = subRes.data as
    | { plan_tier: string; status: string; current_period_end: string | null }
    | null;
  const plan_tier: PlanTier = sub && isPlanTier(sub.plan_tier) ? sub.plan_tier : "starter";

  const [usersRes, wsRes, leadsRes] = await Promise.all([
    client
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .is("deleted_at", null),
    client
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .is("deleted_at", null),
    client
      .from("nodes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .eq("node_type", "lead")
      .is("deleted_at", null)
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      ),
  ]);

  return {
    plan_tier,
    status: sub?.status ?? "active",
    current_period_end: sub?.current_period_end ?? null,
    usage: {
      active_users: usersRes.count ?? 0,
      workspaces: wsRes.count ?? 0,
      leads_30d: leadsRes.count ?? 0,
    },
    limits: PLAN_TIERS[plan_tier],
  };
}

export type UpgradeRequest = {
  organization_id: string;
  user_id: string;
  target_tier: PlanTier;
  reason: string;
};

export type UpgradeResult =
  | { ok: true; ticket_id: string }
  | { ok: false; error: string };

export async function requestPlanUpgrade(
  args: UpgradeRequest,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<UpgradeResult> {
  if (!isPlanTier(args.target_tier)) {
    return { ok: false, error: "invalid_tier" };
  }
  if (!args.reason || args.reason.trim().length < 3) {
    return { ok: false, error: "reason_required" };
  }
  const subject = `Plan upgrade request — ${args.target_tier}`;
  const body = `Target tier: ${args.target_tier}\n\nReason:\n${args.reason.trim()}`;
  const { data, error } = await client
    .from("support_tickets")
    .insert({
      organization_id: args.organization_id,
      raised_by: args.user_id,
      subject,
      body,
      priority: "normal",
      status: "open",
      kind: "plan_upgrade_request",
      created_by: args.user_id,
      created_via: "manual",
      updated_by: args.user_id,
      updated_via: "manual",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  const ticketId = (data as { id: string }).id;

  await client.from("audit_log").insert({
    actor_id: args.user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: args.organization_id,
    workspace_id: null,
    table_name: "support_tickets",
    record_id: ticketId,
    action: "plan_upgrade_requested",
    diff: { target_tier: args.target_tier, reason: args.reason.trim() },
  });

  return { ok: true, ticket_id: ticketId };
}
