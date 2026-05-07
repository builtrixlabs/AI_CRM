"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  advanceStep,
  OnboardingHardGateError,
  OnboardingPayloadError,
  STEP_IDS,
  type StepId,
} from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { requirePermission } from "@/lib/auth/permissions";

export type OnboardingActionState = {
  errors?: Record<string, string[]>;
  message?: string;
  next_step?: StepId | "completed";
  completed?: boolean;
};

const isStepId = (s: string): s is StepId =>
  (STEP_IDS as readonly string[]).includes(s);

/**
 * Single dispatcher server action used by every wizard step. The client
 * component packs `step=<id>`, optional `skip='1'`, and the step-specific
 * payload fields into the FormData. We extract, route to advanceStep, and
 * surface errors back to useActionState — or redirect on completion.
 */
export async function onboardingAction(
  _prev: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Not authenticated. Please sign in." };

  try {
    requirePermission(user, "organizations:edit");
  } catch {
    return { message: "Forbidden — only org_admin / org_owner may run onboarding." };
  }

  if (user.org_id === null) {
    return { message: "No organization context." };
  }

  const stepRaw = formData.get("step")?.toString() ?? "";
  if (!isStepId(stepRaw)) {
    return { message: `Unknown step: ${stepRaw}` };
  }
  const step: StepId = stepRaw;
  const skip = formData.get("skip") === "1";

  const payload = skip ? null : extractPayload(step, formData);

  let result;
  try {
    result = await advanceStep({
      org_id: user.org_id,
      actor: user.user.id,
      step,
      payload,
      skipped: skip,
    });
  } catch (err) {
    if (err instanceof OnboardingHardGateError) {
      return {
        message: `Step '${err.step}' is required and cannot be skipped.`,
      };
    }
    if (err instanceof OnboardingPayloadError) {
      const errors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_form";
        (errors[key] ||= []).push(issue.message);
      }
      return { errors, message: "Validation failed." };
    }
    return {
      message:
        err instanceof Error ? err.message : "Onboarding step failed.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/onboarding");

  if (result.completed) {
    redirect("/admin?onboarded=1");
  }
  return { next_step: result.next_step, completed: result.completed };
}

/**
 * Pull the step-specific fields out of the FormData into the shape that
 * the per-step Zod schema in src/lib/admin/onboarding.ts expects.
 */
function extractPayload(step: StepId, fd: FormData): unknown {
  const get = (k: string) => fd.get(k)?.toString().trim() ?? "";
  const optional = (k: string) => {
    const v = get(k);
    return v.length > 0 ? v : undefined;
  };

  switch (step) {
    case "org_details":
      return {
        rera_number: optional("rera_number"),
        gstin: optional("gstin"),
        primary_contact_email: get("primary_contact_email"),
        primary_contact_name: get("primary_contact_name"),
      };
    case "branding":
      return {
        primary_color: optional("primary_color"),
        accent_color: optional("accent_color"),
        logo_url: optional("logo_url"),
      };
    case "first_workspace":
      return {
        slug: get("slug"),
        name: get("name"),
      };
    case "lead_sources":
      return { sources: fd.getAll("sources").map(String) };
    case "pipeline_stages":
      return { confirmed: true };
    case "team_users": {
      const invites: Array<{
        email: string;
        display_name: string;
        app_role: string;
      }> = [];
      for (let i = 0; i < 3; i++) {
        const email = get(`invite_${i}_email`);
        if (!email) continue;
        invites.push({
          email,
          display_name: get(`invite_${i}_name`) || email,
          app_role: get(`invite_${i}_role`) || "sales_rep",
        });
      }
      return { invites };
    }
    case "integrations":
      return {
        email: optional("email") ?? null,
        whatsapp: optional("whatsapp") ?? null,
        telephony: optional("telephony") ?? null,
      };
    case "sample_demo":
      return { walked_through: true };
  }
}
