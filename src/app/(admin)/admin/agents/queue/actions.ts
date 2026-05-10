"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type QueueActionResult =
  | { ok: true }
  | {
      ok: false;
      error: "permission" | "not_found" | "validation" | "internal";
      message?: string;
    };

async function gate() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return null;
  // Reuse existing perm — agents activity is org-admin territory.
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("agents:view_activity")) {
    return null;
  }
  return user;
}

async function audit(
  client: ReturnType<typeof getSupabaseAdmin>,
  args: {
    user_id: string;
    organization_id: string;
    queue_id: string;
    action: string;
    diff: Record<string, unknown>;
  }
): Promise<void> {
  await client.from("audit_log").insert({
    actor_id: args.user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: args.organization_id,
    workspace_id: null,
    table_name: "agent_approval_queue",
    record_id: args.queue_id,
    action: args.action,
    diff: args.diff,
  });
}

export async function approveQueueItemAction(
  queue_id: string,
  edited_body: string | null
): Promise<QueueActionResult> {
  const user = await gate();
  if (!user || !user.org_id) return { ok: false, error: "permission" };
  const admin = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await admin
    .from("agent_approval_queue")
    .select("status, draft_body, organization_id")
    .eq("id", queue_id)
    .eq("organization_id", user.org_id)
    .maybeSingle();
  if (fetchErr || !existing) return { ok: false, error: "not_found" };
  const e = existing as { status: string; draft_body: string };
  if (e.status !== "pending") {
    return { ok: false, error: "validation", message: "not_pending" };
  }

  const finalBody =
    typeof edited_body === "string" && edited_body.trim().length > 0
      ? edited_body.trim()
      : null;

  const { error: updErr } = await admin
    .from("agent_approval_queue")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: user.user.id,
      ...(finalBody ? { edited_body: finalBody } : {}),
    })
    .eq("id", queue_id)
    .eq("organization_id", user.org_id);
  if (updErr) return { ok: false, error: "internal", message: updErr.message };

  await audit(admin, {
    user_id: user.user.id,
    organization_id: user.org_id,
    queue_id,
    action: "agent_draft_approved",
    diff: {
      edited: finalBody !== null,
      ...(finalBody && finalBody !== e.draft_body
        ? { original_len: e.draft_body.length, edited_len: finalBody.length }
        : {}),
    },
  });

  revalidatePath("/admin/agents/queue");
  return { ok: true };
}

export async function rejectQueueItemAction(
  queue_id: string,
  reason: string
): Promise<QueueActionResult> {
  const user = await gate();
  if (!user || !user.org_id) return { ok: false, error: "permission" };
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    return { ok: false, error: "validation", message: "reason_too_short" };
  }
  const admin = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await admin
    .from("agent_approval_queue")
    .select("status, organization_id")
    .eq("id", queue_id)
    .eq("organization_id", user.org_id)
    .maybeSingle();
  if (fetchErr || !existing) return { ok: false, error: "not_found" };
  if ((existing as { status: string }).status !== "pending") {
    return { ok: false, error: "validation", message: "not_pending" };
  }

  const { error: updErr } = await admin
    .from("agent_approval_queue")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: user.user.id,
      decision_reason: trimmedReason,
    })
    .eq("id", queue_id)
    .eq("organization_id", user.org_id);
  if (updErr) return { ok: false, error: "internal", message: updErr.message };

  await audit(admin, {
    user_id: user.user.id,
    organization_id: user.org_id,
    queue_id,
    action: "agent_draft_rejected",
    diff: { reason: trimmedReason },
  });

  revalidatePath("/admin/agents/queue");
  return { ok: true };
}
