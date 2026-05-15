"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import type { Permission } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { updateNodeData } from "@/lib/nodes/api";
import { transitionSiteVisit } from "@/lib/sitevisits/api";
import {
  claimCoordination,
  releaseCoordination,
} from "@/lib/sitevisits/coordinator";
import { istDayKey } from "@/lib/sitevisits/ist";
import {
  IllegalTransitionError,
  type SiteVisitState,
} from "@/lib/sitevisits/transitions";

export type SiteVisitActionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "permission"
        | "not_found"
        | "validation"
        | "conflict"
        | "internal";
      message?: string;
    };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Gated =
  | { ok: true; user_id: string; org_id: string; base_role: string }
  | { ok: false; reason: "permission" };

async function gate(perm: Permission): Promise<Gated> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, reason: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has(perm)) return { ok: false, reason: "permission" };
  return {
    ok: true,
    user_id: user.user.id,
    org_id: user.org_id,
    base_role: user.profile.base_role,
  };
}

/** Status-workflow transition. `cancelled` needs `site_visits:cancel`. */
export async function transitionSiteVisitAction(
  id: string,
  target_state: SiteVisitState,
  reason?: string,
): Promise<SiteVisitActionResult> {
  const needed: Permission =
    target_state === "cancelled" ? "site_visits:cancel" : "site_visits:edit";
  const g = await gate(needed);
  if (!g.ok) return g;
  if (!UUID_RE.test(id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }

  try {
    await transitionSiteVisit({
      id,
      target_state,
      actor: g.user_id,
      caller_org_id: g.org_id,
      reason,
    });
  } catch (e) {
    if (e instanceof IllegalTransitionError) {
      return { ok: false, reason: "validation", message: e.message };
    }
    const msg = e instanceof Error ? e.message : "internal";
    if (/not found/i.test(msg)) return { ok: false, reason: "not_found" };
    if (/reason required/i.test(msg)) {
      return { ok: false, reason: "validation", message: "reason_required" };
    }
    return { ok: false, reason: "internal", message: msg };
  }

  revalidatePath("/dashboard/site-visits");
  revalidatePath(`/dashboard/site-visits/${id}`);
  return { ok: true };
}

/** Assign (or reassign) the sales rep for a site visit. */
export async function assignSalesRepAction(
  id: string,
  sales_rep_id: string,
): Promise<SiteVisitActionResult> {
  const g = await gate("site_visits:assign");
  if (!g.ok) return g;
  if (!UUID_RE.test(id) || !UUID_RE.test(sales_rep_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }

  const admin = getSupabaseAdmin();
  // Org-scope check — the visit must belong to the caller's org. The
  // organization_id filter is the load-bearing tenant guard on a
  // service-role read.
  const { data: existing } = await admin
    .from("nodes")
    .select("id")
    .eq("id", id)
    .eq("node_type", "site_visit")
    .eq("organization_id", g.org_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return { ok: false, reason: "not_found" };

  try {
    await updateNodeData(
      {
        id,
        partial: { assigned_sales_rep_id: sales_rep_id },
        updated_by: g.user_id,
      },
      admin,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal";
    return { ok: false, reason: "internal", message: msg };
  }

  revalidatePath("/dashboard/site-visits");
  revalidatePath(`/dashboard/site-visits/${id}`);
  return { ok: true };
}

async function writeCoordinationAudit(args: {
  user_id: string;
  org_id: string;
  base_role: string;
  action: "coordination_claimed" | "coordination_released";
  coordination_date: string;
}): Promise<void> {
  await getSupabaseAdmin()
    .from("audit_log")
    .insert({
      actor_id: args.user_id,
      actor_type: "user",
      actor_role: args.base_role,
      organization_id: args.org_id,
      workspace_id: null,
      table_name: "site_visit_coordinator_claims",
      record_id: null,
      action: args.action,
      diff: { coordination_date: args.coordination_date },
    });
}

/** Claim today's (or a given IST day's) coordination — atomic. */
export async function claimCoordinationAction(
  date?: string,
): Promise<SiteVisitActionResult> {
  const g = await gate("site_visits:coordinate");
  if (!g.ok) return g;
  const coordination_date = date ?? istDayKey(new Date());

  const result = await claimCoordination({
    organization_id: g.org_id,
    coordinator_id: g.user_id,
    coordination_date,
  });

  if (!result.ok) {
    if (result.reason === "already_claimed") {
      return {
        ok: false,
        reason: "conflict",
        message: `Already claimed by ${result.coordinator_id}`,
      };
    }
    return { ok: false, reason: "internal", message: result.message };
  }

  await writeCoordinationAudit({
    user_id: g.user_id,
    org_id: g.org_id,
    base_role: g.base_role,
    action: "coordination_claimed",
    coordination_date,
  });

  revalidatePath("/dashboard/site-visits");
  return { ok: true };
}

/** Release the caller's own coordination claim for an IST day. */
export async function releaseCoordinationAction(
  date?: string,
): Promise<SiteVisitActionResult> {
  const g = await gate("site_visits:coordinate");
  if (!g.ok) return g;
  const coordination_date = date ?? istDayKey(new Date());

  const result = await releaseCoordination({
    organization_id: g.org_id,
    coordinator_id: g.user_id,
    coordination_date,
  });

  if (!result.ok) {
    if (result.reason === "not_claimant") {
      return { ok: false, reason: "permission", message: "not_claimant" };
    }
    return { ok: false, reason: "internal", message: result.message };
  }

  await writeCoordinationAudit({
    user_id: g.user_id,
    org_id: g.org_id,
    base_role: g.base_role,
    action: "coordination_released",
    coordination_date,
  });

  revalidatePath("/dashboard/site-visits");
  return { ok: true };
}
