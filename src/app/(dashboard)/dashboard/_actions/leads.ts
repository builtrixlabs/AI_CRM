"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createLead,
  transitionLead,
  createLeadInputSchema,
  updateLeadInputSchema,
  transitionInputSchema,
  IllegalTransitionError,
  type LeadState,
} from "@/lib/leads";
import { updateNodeData, NodeValidationError } from "@/lib/nodes/api";

/**
 * Confirms a lead row belongs to the caller's tenant before the action's
 * mutating helper runs. Returns null if the lead is missing or in another
 * tenant — caller maps null to a "validation" error (no existence leak).
 *
 * The mutating helpers (updateNodeData, transitionLead) use the service-role
 * client which bypasses RLS, so this gate is the load-bearing tenant check
 * for D-007 server actions.
 */
async function assertLeadInTenant(
  lead_id: string,
  caller_org_id: string,
): Promise<{ workspace_id: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nodes")
    .select("organization_id, workspace_id")
    .eq("id", lead_id)
    .eq("node_type", "lead")
    .eq("organization_id", caller_org_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  return { workspace_id: (data as { workspace_id: string }).workspace_id };
}

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: "permission" | "validation" | "unknown";
      fieldErrors?: Record<string, string>;
      message?: string;
    };

function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

const stringOrUndef = (raw: FormDataEntryValue | null): string | undefined => {
  if (raw == null) return undefined;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
};

// ── createLeadAction ───────────────────────────────────────────────────────

export async function createLeadAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("leads:create")) {
    return { ok: false, error: "permission" };
  }

  const payload = {
    phone: stringOrUndef(formData.get("phone")),
    source: stringOrUndef(formData.get("source")),
    email: stringOrUndef(formData.get("email")),
    notes: stringOrUndef(formData.get("notes")),
  };
  const parsed = createLeadInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const workspace_id = user.workspace_ids[0];
  if (!workspace_id) {
    return {
      ok: false,
      error: "validation",
      message: "User has no workspace assigned",
    };
  }

  try {
    const result = await createLead({
      organization_id: user.org_id,
      workspace_id,
      created_by: user.user.id,
      data: parsed.data,
    });
    revalidatePath("/dashboard");
    return { ok: true, data: { id: result.id } };
  } catch (err) {
    if (err instanceof NodeValidationError) {
      return {
        ok: false,
        error: "validation",
        message: err.message,
      };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── updateLeadAction ───────────────────────────────────────────────────────

const leadIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

export async function updateLeadAction(
  lead_id: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("leads:edit")) {
    return { ok: false, error: "permission" };
  }

  if (!leadIdSchema.safeParse(lead_id).success) {
    return { ok: false, error: "validation", message: "Malformed lead_id" };
  }

  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const tenantCheck = await assertLeadInTenant(lead_id, user.org_id);
  if (!tenantCheck) {
    // Same shape as 'lead does not exist' — never leak cross-tenant existence.
    return { ok: false, error: "validation", message: "Lead not found" };
  }

  const partialPayload: Record<string, string | undefined> = {
    phone: stringOrUndef(formData.get("phone")),
    source: stringOrUndef(formData.get("source")),
    email: stringOrUndef(formData.get("email")),
    notes: stringOrUndef(formData.get("notes")),
    label: stringOrUndef(formData.get("label")),
  };
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(partialPayload)) {
    if (v !== undefined) filtered[k] = v;
  }

  const parsed = updateLeadInputSchema.safeParse(filtered);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await updateNodeData({
      id: lead_id,
      partial: parsed.data,
      updated_by: user.user.id,
      updated_via: "manual",
    });
    revalidatePath(`/dashboard/leads/${lead_id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof NodeValidationError) {
      return {
        ok: false,
        error: "validation",
        message: err.message,
      };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── transitionLeadAction ───────────────────────────────────────────────────

export async function transitionLeadAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("leads:edit")) {
    return { ok: false, error: "permission" };
  }

  const payload = {
    lead_id: stringOrUndef(formData.get("lead_id")),
    target_state: stringOrUndef(formData.get("target_state")),
    reason: stringOrUndef(formData.get("reason")),
  };
  const parsed = transitionInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }

  try {
    await transitionLead({
      lead_id: parsed.data.lead_id,
      target_state: parsed.data.target_state as LeadState,
      actor: user.user.id,
      caller_org_id: user.org_id,
      reason: parsed.data.reason,
    });
    revalidatePath(`/dashboard/leads/${parsed.data.lead_id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof IllegalTransitionError) {
      return {
        ok: false,
        error: "validation",
        message: err.message,
      };
    }
    if (err instanceof Error && /not found/i.test(err.message)) {
      // Cross-tenant or missing — same shape, no existence leak.
      return {
        ok: false,
        error: "validation",
        message: "Lead not found",
      };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
