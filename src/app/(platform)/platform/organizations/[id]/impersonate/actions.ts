"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { startImpersonation } from "@/lib/platform/impersonation";

export type StartImpersonationResult =
  | { ok: true }
  | { ok: false; reason: "permission" | "validation" | "not_found" | "internal"; message?: string };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function startImpersonationAction(
  organization_id: string,
  reason: string,
): Promise<StartImpersonationResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, reason: "permission" };
  }
  if (!UUID_RE.test(organization_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  if (!reason || reason.trim().length < 10) {
    return { ok: false, reason: "validation", message: "reason_too_short" };
  }

  const r = await startImpersonation({
    super_admin_id: user.user.id,
    organization_id,
    reason,
  });
  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    if (r.reason === "validation") {
      return { ok: false, reason: "validation", message: "reason_too_short" };
    }
    return { ok: false, reason: "internal", message: r.reason };
  }

  // Redirect to the org's admin surface — the banner will be on every page.
  redirect("/admin");
}
