"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchApprovedDraft } from "@/lib/agents/follow-up/dispatch";
import { confirmSiteVisitBooking } from "@/lib/agents/site-visit-agent";

export type QueueActionResult =
  | { ok: true; dispatch?: "sent" }
  | { ok: true; dispatch: "deferred"; channel: "email" | "sms" | "whatsapp" }
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

  // D-415 — auto-dispatch via per-channel adapter (mock provider in V1).
  // On success: row transitions approved → sent. On error: status stays
  // approved, send_error recorded so operator can retry.
  const dispatchResult = await dispatchApprovedDraft(
    {
      queue_id,
      organization_id: user.org_id,
      actor_id: user.user.id,
    },
    admin,
  );

  revalidatePath("/admin/agents/queue");

  if (dispatchResult.ok) {
    if ("already_sent" in dispatchResult) {
      return { ok: true, dispatch: "sent" };
    }
    return { ok: true, dispatch: "sent" };
  }
  if (dispatchResult.reason === "not_configured") {
    // Approval succeeded; the org has not configured (or not finished
    // configuring) this channel. dispatch.ts sets `message` to the channel
    // name so the queue UI can point the operator at /admin/integrations.
    return {
      ok: true,
      dispatch: "deferred",
      channel: (dispatchResult.message ?? "email") as
        | "email"
        | "sms"
        | "whatsapp",
    };
  }
  // Approval succeeded in DB but dispatch failed. Surface so the UI can
  // show the error; the row is still 'approved' and operator can retry.
  return {
    ok: false,
    error: "internal",
    message: dispatchResult.message ?? dispatchResult.reason,
  };
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

export type SiteVisitBookingActionResult =
  | { ok: true; dispatch: "sent" | "deferred"; assigned: boolean }
  | {
      ok: false;
      error: "permission" | "not_found" | "validation" | "internal";
      message?: string;
    };

/**
 * D-601 — finalize a `site_visit_booking` queue row from the cab form.
 * Gated `agents:view_activity` (the sibling queue-action gate); all the
 * booking logic — write cab fields, transition draft→scheduled, auto-assign
 * the project rep, dispatch the WhatsApp confirmation — is in
 * `confirmSiteVisitBooking`.
 */
export async function submitSiteVisitBookingAction(
  queue_id: string,
  cab: unknown,
): Promise<SiteVisitBookingActionResult> {
  const user = await gate();
  if (!user || !user.org_id) return { ok: false, error: "permission" };

  const result = await confirmSiteVisitBooking({
    organization_id: user.org_id,
    actor_id: user.user.id,
    queue_id,
    cab,
  });

  if (!result.ok) {
    const error: "not_found" | "validation" | "internal" =
      result.reason === "queue_not_found" ||
      result.reason === "visit_not_found"
        ? "not_found"
        : result.reason === "validation" ||
            result.reason === "wrong_kind" ||
            result.reason === "not_pending" ||
            result.reason === "no_ref_node"
          ? "validation"
          : "internal";
    return { ok: false, error, message: result.message ?? result.reason };
  }

  revalidatePath("/admin/agents/queue");
  return {
    ok: true,
    dispatch: result.dispatch,
    assigned: result.assigned_sales_rep_id !== null,
  };
}
