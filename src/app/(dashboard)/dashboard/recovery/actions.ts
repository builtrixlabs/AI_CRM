"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import type { Permission } from "@/lib/auth/rbac";
import { claimRecoveryItem, resolveRecoveryItem } from "@/lib/recovery/queue";
import {
  RECOVERY_RESOLUTIONS,
  type RecoveryResolution,
} from "@/lib/recovery/types";

export type RecoveryActionResult =
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
  | { ok: true; user_id: string; org_id: string }
  | { ok: false; reason: "permission" };

async function gate(perm: Permission): Promise<Gated> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, reason: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has(perm)) return { ok: false, reason: "permission" };
  return { ok: true, user_id: user.user.id, org_id: user.org_id };
}

export async function claimRecoveryItemAction(
  queue_id: string,
): Promise<RecoveryActionResult> {
  const g = await gate("recovery:claim");
  if (!g.ok) return g;
  if (!UUID_RE.test(queue_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }

  const r = await claimRecoveryItem({
    organization_id: g.org_id,
    queue_id,
    user_id: g.user_id,
  });

  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    if (r.reason === "already_claimed" || r.reason === "resolved") {
      return { ok: false, reason: "conflict", message: r.reason };
    }
    return { ok: false, reason: "internal", message: r.reason };
  }

  revalidatePath("/dashboard/recovery");
  return { ok: true };
}

export async function resolveRecoveryItemAction(
  queue_id: string,
  resolution: RecoveryResolution,
  note?: string,
): Promise<RecoveryActionResult> {
  const g = await gate("recovery:resolve");
  if (!g.ok) return g;
  if (!UUID_RE.test(queue_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  if (!RECOVERY_RESOLUTIONS.includes(resolution)) {
    return { ok: false, reason: "validation", message: "bad_resolution" };
  }

  const r = await resolveRecoveryItem({
    organization_id: g.org_id,
    queue_id,
    user_id: g.user_id,
    resolution,
    note,
  });

  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    if (r.reason === "already_resolved") {
      return { ok: false, reason: "conflict", message: "already_resolved" };
    }
    if (r.reason === "invalid_resolution") {
      return { ok: false, reason: "validation", message: "invalid_resolution" };
    }
    return { ok: false, reason: "internal", message: r.reason };
  }

  revalidatePath("/dashboard/recovery");
  return { ok: true };
}
