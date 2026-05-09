"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { requestPlanUpgrade } from "@/lib/admin/billing";
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
