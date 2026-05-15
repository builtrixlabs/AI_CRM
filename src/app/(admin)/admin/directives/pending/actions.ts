"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  approveWorkflow,
  rejectWorkflow,
  DirectiveAuthoringError,
} from "@/lib/doe/authoring";

export type WorkflowDecisionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "permission"
        | "validation"
        | "not_found"
        | "conflict"
        | "unknown";
      message?: string;
    };

async function gate() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return null;
  const perms = resolveForUser(user);
  if (!perms.has("directives:approve")) return null;
  return user;
}

function mapError(err: unknown): WorkflowDecisionResult {
  if (err instanceof DirectiveAuthoringError) {
    const error =
      err.kind === "not_found"
        ? "not_found"
        : err.kind === "conflict"
          ? "conflict"
          : "validation";
    return { ok: false, error, message: err.message };
  }
  return {
    ok: false,
    error: "unknown",
    message: err instanceof Error ? err.message : "Unknown error",
  };
}

/** D-615 — approve a pending AI workflow. Gated on `directives:approve`. */
export async function approveWorkflowAction(
  directive_id: string,
): Promise<WorkflowDecisionResult> {
  const user = await gate();
  if (!user || !user.org_id) return { ok: false, error: "permission" };
  try {
    await approveWorkflow({
      caller_org_id: user.org_id,
      actor_id: user.user.id,
      actor_role: user.profile.base_role,
      directive_id,
    });
    revalidatePath("/admin/directives/pending");
    revalidatePath("/admin/directives");
    return { ok: true };
  } catch (err) {
    return mapError(err);
  }
}

/**
 * D-615 — reject a pending AI workflow. Requires a reason ≥ 10 chars
 * (enforced in `rejectWorkflow`). Gated on `directives:approve`.
 */
export async function rejectWorkflowAction(
  directive_id: string,
  reason: string,
): Promise<WorkflowDecisionResult> {
  const user = await gate();
  if (!user || !user.org_id) return { ok: false, error: "permission" };
  try {
    await rejectWorkflow({
      caller_org_id: user.org_id,
      actor_id: user.user.id,
      actor_role: user.profile.base_role,
      directive_id,
      reason,
    });
    revalidatePath("/admin/directives/pending");
    revalidatePath("/admin/directives");
    return { ok: true };
  } catch (err) {
    return mapError(err);
  }
}
