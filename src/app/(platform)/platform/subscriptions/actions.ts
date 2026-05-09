"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  cancelOrg,
  changePlanTier,
  isPlanTier,
  reactivateOrg,
  suspendOrg,
} from "@/lib/platform/subscriptions";

export type SubAction =
  | { kind: "change_tier"; org_id: string; new_tier: string }
  | { kind: "suspend"; org_id: string; reason: string }
  | { kind: "cancel"; org_id: string; reason: string; grace_days?: number }
  | { kind: "reactivate"; org_id: string };

export type SubActionResult =
  | { ok: true }
  | { ok: false; error: "permission" | "validation" | "internal"; message?: string };

async function gate(): Promise<{ ok: true; user_id: string } | { ok: false }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (user.profile.base_role !== "super_admin") return { ok: false };
  return { ok: true, user_id: user.user.id };
}

export async function performSubAction(action: SubAction): Promise<SubActionResult> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: "permission" };

  const ctx = { actor_id: g.user_id, organization_id: action.org_id };

  let result;
  switch (action.kind) {
    case "change_tier":
      if (!isPlanTier(action.new_tier)) {
        return { ok: false, error: "validation", message: "invalid_tier" };
      }
      result = await changePlanTier(ctx, action.new_tier);
      break;
    case "suspend":
      result = await suspendOrg(ctx, action.reason);
      break;
    case "cancel":
      result = await cancelOrg(ctx, action.reason, action.grace_days ?? 30);
      break;
    case "reactivate":
      result = await reactivateOrg(ctx);
      break;
  }

  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "reason_required" || result.error === "invalid_tier"
        ? "validation"
        : "internal",
      message: result.error,
    };
  }
  revalidatePath("/platform/subscriptions");
  revalidatePath(`/platform/organizations/${action.org_id}`);
  return { ok: true };
}
