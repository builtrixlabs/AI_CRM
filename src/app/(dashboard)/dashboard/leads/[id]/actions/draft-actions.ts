"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canApproveQueueItem } from "@/lib/auth/can-approve-queue-item";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchApprovedDraft } from "@/lib/agents/follow-up/dispatch";
import { confirmSiteVisitBooking } from "@/lib/agents/site-visit-agent";

/**
 * v6.2.1 — owner-scoped draft actions for the lead-canvas AI Drafts tab.
 *
 * These mirror /admin/agents/queue/actions.ts but with a different gate:
 *   - Admin actions: `agents:view_activity` base-role check (manager+).
 *   - These actions: `canApproveQueueItem` — three paths
 *       (workspace_admin+, manager+, OR owner with agents:approve_own_leads).
 *
 * Same DB writes, same dispatch path. The split exists because (a) the
 * permission boundary is owner-scoped, not role-scoped, and (b) the
 * server action revalidates a different path so realtime UI updates on
 * the lead canvas.
 *
 * Wire-compatible result shape with DraftCardActionResult so the same
 * <DraftCard> component can call either set of actions.
 */

export type DraftActionResult =
  | { ok: true; dispatch?: "sent" }
  | { ok: true; dispatch: "deferred"; channel: "email" | "sms" | "whatsapp" }
  | {
      ok: false;
      error: "permission" | "not_found" | "validation" | "internal";
      message?: string;
    };

async function gate(queue_id: string): Promise<
  | {
      ok: true;
      user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
      org_id: string;
      lead_id: string;
      draft_body: string;
      status: string;
      ref_node_id: string | null;
      admin: ReturnType<typeof getSupabaseAdmin>;
    }
  | { ok: false; error: DraftActionResult & { ok: false } }
> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) {
    return { ok: false, error: { ok: false, error: "permission" } };
  }
  const admin = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await admin
    .from("agent_approval_queue")
    .select("status, draft_body, lead_id, organization_id, ref_node_id")
    .eq("id", queue_id)
    .eq("organization_id", user.org_id)
    .maybeSingle();
  if (fetchErr || !existing) {
    return { ok: false, error: { ok: false, error: "not_found" } };
  }
  const row = existing as {
    status: string;
    draft_body: string;
    lead_id: string;
    organization_id: string;
    ref_node_id: string | null;
  };

  const allowed = await canApproveQueueItem(
    user,
    { lead_id: row.lead_id, organization_id: row.organization_id },
    admin,
  );
  if (!allowed) {
    return { ok: false, error: { ok: false, error: "permission" } };
  }

  return {
    ok: true,
    user,
    org_id: user.org_id,
    lead_id: row.lead_id,
    draft_body: row.draft_body,
    status: row.status,
    ref_node_id: row.ref_node_id,
    admin,
  };
}

async function audit(
  admin: ReturnType<typeof getSupabaseAdmin>,
  args: {
    user_id: string;
    organization_id: string;
    queue_id: string;
    action: string;
    diff: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from("audit_log").insert({
    actor_id: args.user_id,
    actor_type: "user",
    actor_role: "sales_rep",
    organization_id: args.organization_id,
    workspace_id: null,
    table_name: "agent_approval_queue",
    record_id: args.queue_id,
    action: args.action,
    diff: args.diff,
  });
}

export async function approveDraftOnLeadAction(
  queue_id: string,
  edited_body: string | null,
): Promise<DraftActionResult> {
  const g = await gate(queue_id);
  if (!g.ok) return g.error;

  if (g.status !== "pending") {
    return { ok: false, error: "validation", message: "not_pending" };
  }

  const finalBody =
    typeof edited_body === "string" && edited_body.trim().length > 0
      ? edited_body.trim()
      : null;

  const { error: updErr } = await g.admin
    .from("agent_approval_queue")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: g.user.user.id,
      ...(finalBody ? { edited_body: finalBody } : {}),
    })
    .eq("id", queue_id)
    .eq("organization_id", g.org_id);
  if (updErr) return { ok: false, error: "internal", message: updErr.message };

  await audit(g.admin, {
    user_id: g.user.user.id,
    organization_id: g.org_id,
    queue_id,
    action: "agent_draft_approved",
    diff: {
      surface: "lead_canvas",
      edited: finalBody !== null,
      ...(finalBody && finalBody !== g.draft_body
        ? { original_len: g.draft_body.length, edited_len: finalBody.length }
        : {}),
    },
  });

  const dispatchResult = await dispatchApprovedDraft(
    {
      queue_id,
      organization_id: g.org_id,
      actor_id: g.user.user.id,
    },
    g.admin,
  );

  revalidatePath(`/dashboard/leads/${g.lead_id}`);

  if (dispatchResult.ok) {
    return { ok: true, dispatch: "sent" };
  }
  if (dispatchResult.reason === "not_configured") {
    return {
      ok: true,
      dispatch: "deferred",
      channel: (dispatchResult.message ?? "email") as
        | "email"
        | "sms"
        | "whatsapp",
    };
  }
  return {
    ok: false,
    error: "internal",
    message: dispatchResult.message ?? dispatchResult.reason,
  };
}

export async function rejectDraftOnLeadAction(
  queue_id: string,
  reason: string,
): Promise<DraftActionResult> {
  const g = await gate(queue_id);
  if (!g.ok) return g.error;

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    return { ok: false, error: "validation", message: "reason_too_short" };
  }
  if (g.status !== "pending") {
    return { ok: false, error: "validation", message: "not_pending" };
  }

  const { error: updErr } = await g.admin
    .from("agent_approval_queue")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: g.user.user.id,
      decision_reason: trimmedReason,
    })
    .eq("id", queue_id)
    .eq("organization_id", g.org_id);
  if (updErr) return { ok: false, error: "internal", message: updErr.message };

  await audit(g.admin, {
    user_id: g.user.user.id,
    organization_id: g.org_id,
    queue_id,
    action: "agent_draft_rejected",
    diff: { surface: "lead_canvas", reason: trimmedReason },
  });

  revalidatePath(`/dashboard/leads/${g.lead_id}`);
  return { ok: true };
}

export type SiteVisitOnLeadResult =
  | { ok: true; dispatch: "sent" | "deferred"; assigned: boolean }
  | {
      ok: false;
      error: "permission" | "not_found" | "validation" | "internal";
      message?: string;
    };

/**
 * v6.2.1 — owner-scoped site-visit booking. Same flow as the admin queue's
 * `submitSiteVisitBookingAction`, but gated via `canApproveQueueItem` so a
 * sales rep can confirm their own lead's visit inline.
 */
export async function confirmSiteVisitOnLeadAction(
  queue_id: string,
  cab: unknown,
): Promise<SiteVisitOnLeadResult> {
  const g = await gate(queue_id);
  if (!g.ok) return g.error;

  const result = await confirmSiteVisitBooking({
    organization_id: g.org_id,
    actor_id: g.user.user.id,
    queue_id,
    cab,
  });

  if (!result.ok) {
    const error: "not_found" | "validation" | "internal" =
      result.reason === "queue_not_found" || result.reason === "visit_not_found"
        ? "not_found"
        : result.reason === "validation" ||
            result.reason === "wrong_kind" ||
            result.reason === "not_pending" ||
            result.reason === "no_ref_node"
          ? "validation"
          : "internal";
    return { ok: false, error, message: result.message ?? result.reason };
  }

  revalidatePath(`/dashboard/leads/${g.lead_id}`);
  return {
    ok: true,
    dispatch: result.dispatch,
    assigned: result.assigned_sales_rep_id !== null,
  };
}
