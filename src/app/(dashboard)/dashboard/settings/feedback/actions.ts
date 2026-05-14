"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FeedbackActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "permission" | "validation" | "internal";
      message?: string;
    };

const CATEGORIES = ["bug", "idea", "question", "other"] as const;

/**
 * D-617 — persist an in-app feedback submission. There is no dedicated
 * feedback table in V6; the org-scoped append-only `audit_log` is the
 * persistence (a triage inbox is a documented follow-up).
 */
export async function submitFeedbackAction(
  category: string,
  message: string,
): Promise<FeedbackActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, reason: "permission" };

  const cat = (CATEGORIES as readonly string[]).includes(category)
    ? category
    : "other";
  const trimmed = message.trim();
  if (trimmed.length < 3) {
    return {
      ok: false,
      reason: "validation",
      message: "Feedback message is too short",
    };
  }
  if (trimmed.length > 4000) {
    return {
      ok: false,
      reason: "validation",
      message: "Feedback message is too long (4000 char max)",
    };
  }

  const { error } = await getSupabaseAdmin().from("audit_log").insert({
    actor_id: user.user.id,
    actor_type: "user",
    actor_role: user.profile.base_role,
    organization_id: user.org_id,
    workspace_id: null,
    table_name: "feedback",
    record_id: null,
    action: "feedback_submitted",
    diff: { category: cat, message: trimmed },
  });
  if (error) return { ok: false, reason: "internal", message: error.message };
  return { ok: true };
}
