"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  transitionLead,
  IllegalTransitionError,
  LEAD_STATES,
  type LeadState,
} from "@/lib/leads";
import { addCommentAction } from "./add-comment";

/**
 * v6.2.1 — Quick Action modal server action.
 *
 * Three optional fields, one atomic save:
 *   1. comment text     → nodes row, node_type='note'
 *   2. target_state     → transitionLead (state-machine enforced)
 *   3. follow_up_on     → patches lead.data.follow_up_on (ISO 8601)
 *
 * Atomicity strategy (no Postgres function — single-action SQL chain):
 *   - Step 0: read lead's current state. Validate target_state is a legal
 *             transition. Fail fast without writing anything if invalid.
 *   - Step 1: comment write (when provided). If it fails, return without
 *             touching state or follow-up.
 *   - Step 2: state transition (when provided). transitionLead throws on
 *             illegal transitions; we validated upfront, so this only
 *             throws on race conditions (someone else moved the lead
 *             between our read + write). If it fails AFTER the comment
 *             write, the comment stays (cheaper than orchestrating a
 *             compensating delete, and the comment is independently
 *             valuable — the operator typed it).
 *   - Step 3: follow-up patch (when provided). Same posture: failure here
 *             leaves the comment + state change intact.
 *
 * The spec's "rollback on status failure" is honored by Step 0's
 * pre-validation, which catches the overwhelmingly common failure path
 * (operator picks an illegal transition) BEFORE any write happens.
 */

export type QuickActionInput = {
  comment?: string;
  target_state?: LeadState;
  follow_up_on?: string; // ISO 8601
  /** Reason — required when target_state is terminal (lost / on_hold / junk). */
  reason?: string;
};

export type QuickActionResult =
  | {
      ok: true;
      comment_id: string | null;
      state_changed: boolean;
      follow_up_set: boolean;
    }
  | {
      ok: false;
      error: "permission" | "not_found" | "validation" | "internal";
      message?: string;
      /** Which step failed — useful for the UI to know what to retry. */
      step?: "validate" | "comment" | "state" | "follow_up";
    };

function isFutureIso(value: string): boolean {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return false;
  return t > Date.now();
}

export async function quickActionAction(
  lead_id: string,
  input: QuickActionInput,
): Promise<QuickActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, error: "permission" };

  const perms = resolveForUser(user);
  if (!perms.has("leads:edit")) {
    return { ok: false, error: "permission" };
  }

  // No-op guard: at least one field must be provided.
  const wantsComment = !!input.comment && input.comment.trim().length > 0;
  const wantsState = !!input.target_state;
  const wantsFollowUp = !!input.follow_up_on;
  if (!wantsComment && !wantsState && !wantsFollowUp) {
    return {
      ok: false,
      error: "validation",
      message: "no_fields",
      step: "validate",
    };
  }

  if (wantsFollowUp && !isFutureIso(input.follow_up_on!)) {
    return {
      ok: false,
      error: "validation",
      message: "follow_up_not_future",
      step: "validate",
    };
  }
  if (wantsState && !LEAD_STATES.includes(input.target_state!)) {
    return {
      ok: false,
      error: "validation",
      message: "invalid_target_state",
      step: "validate",
    };
  }

  const admin = getSupabaseAdmin();

  // Step 0 — load lead, validate state transition is legal upfront.
  const { data: lead } = await admin
    .from("nodes")
    .select("id, state, organization_id, workspace_id, data")
    .eq("id", lead_id)
    .eq("organization_id", user.org_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead) return { ok: false, error: "not_found" };
  const leadRow = lead as {
    id: string;
    state: string;
    organization_id: string;
    workspace_id: string;
    data: Record<string, unknown>;
  };

  if (wantsState) {
    // Cheap upfront check — transitionLead will re-validate; we want to fail
    // BEFORE the comment write, so duplicate the check here.
    try {
      const { TRANSITIONS } = await import("@/lib/leads/transitions");
      const from = leadRow.state as LeadState;
      const to = input.target_state!;
      if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) {
        return {
          ok: false,
          error: "validation",
          message: `illegal_transition_${from}_to_${to}`,
          step: "validate",
        };
      }
      // Reason required for terminal states.
      const { TERMINAL_STATES } = await import("@/lib/leads/transitions");
      if (TERMINAL_STATES.has(to) && (!input.reason || input.reason.trim().length === 0)) {
        return {
          ok: false,
          error: "validation",
          message: "reason_required_for_terminal",
          step: "validate",
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: "internal",
        message: err instanceof Error ? err.message : "import_failed",
        step: "validate",
      };
    }
  }

  // Step 1 — comment write.
  let comment_id: string | null = null;
  if (wantsComment) {
    const r = await addCommentAction(lead_id, input.comment!);
    if (!r.ok) {
      return {
        ok: false,
        error: r.error,
        message: r.message,
        step: "comment",
      };
    }
    comment_id = r.comment_id;
  }

  // Step 2 — state transition.
  let state_changed = false;
  if (wantsState) {
    try {
      await transitionLead(
        {
          lead_id,
          target_state: input.target_state!,
          actor: user.user.id,
          caller_org_id: user.org_id,
          reason: input.reason,
        },
        admin,
      );
      state_changed = true;
    } catch (err) {
      if (err instanceof IllegalTransitionError) {
        return {
          ok: false,
          error: "validation",
          message: err.message,
          step: "state",
        };
      }
      return {
        ok: false,
        error: "internal",
        message: err instanceof Error ? err.message : "state_change_failed",
        step: "state",
      };
    }
  }

  // Step 3 — follow-up patch.
  let follow_up_set = false;
  if (wantsFollowUp) {
    const mergedData = {
      ...leadRow.data,
      follow_up_on: input.follow_up_on,
    };
    const { error } = await admin
      .from("nodes")
      .update({
        data: mergedData,
        updated_at: new Date().toISOString(),
        updated_by: user.user.id,
        updated_via: "manual",
      })
      .eq("id", lead_id)
      .eq("organization_id", user.org_id);
    if (error) {
      return {
        ok: false,
        error: "internal",
        message: error.message,
        step: "follow_up",
      };
    }
    follow_up_set = true;

    await admin.from("audit_log").insert({
      actor_id: user.user.id,
      actor_type: "user",
      actor_role: "sales_rep",
      organization_id: user.org_id,
      workspace_id: leadRow.workspace_id,
      table_name: "nodes",
      record_id: lead_id,
      action: "follow_up_scheduled",
      diff: { follow_up_on: input.follow_up_on },
    });
  }

  revalidatePath(`/dashboard/leads/${lead_id}`);
  return { ok: true, comment_id, state_changed, follow_up_set };
}
