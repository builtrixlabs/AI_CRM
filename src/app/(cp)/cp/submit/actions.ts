"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { submitCpLead } from "@/lib/cp/submission";

export type SubmitCpLeadResult =
  | { ok: true; lead_node_id: string }
  | {
      ok: false;
      error: "permission" | "validation" | "no_workspace" | "internal";
      message?: string;
      fieldErrors?: Record<string, string>;
    };

export async function submitCpLeadAction(
  formData: FormData
): Promise<SubmitCpLeadResult> {
  const user = await getCurrentUser();
  if (!user || !user.org_id) {
    return { ok: false, error: "permission" };
  }
  if (user.profile.base_role !== "channel_partner") {
    return {
      ok: false,
      error: "permission",
      message: "Only channel partners can submit through this surface.",
    };
  }

  const phoneRaw = formData.get("phone");
  const emailRaw = formData.get("email");
  const sourcePropRaw = formData.get("source_property");
  const budgetRaw = formData.get("expected_budget");
  const notesRaw = formData.get("notes");

  if (typeof phoneRaw !== "string" || phoneRaw.trim().length < 7) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: { phone: "Phone is required (min 7 chars)." },
    };
  }

  const result = await submitCpLead({
    organization_id: user.org_id,
    user_id: user.user.id,
    phone: phoneRaw.trim(),
    email: typeof emailRaw === "string" && emailRaw.trim().length > 0
      ? emailRaw.trim()
      : null,
    source_property:
      typeof sourcePropRaw === "string" && sourcePropRaw.trim().length > 0
        ? sourcePropRaw.trim()
        : null,
    expected_budget:
      typeof budgetRaw === "string" && budgetRaw.trim().length > 0
        ? budgetRaw.trim()
        : null,
    notes:
      typeof notesRaw === "string" && notesRaw.trim().length > 0
        ? notesRaw.trim()
        : null,
  });

  if (!result.ok) return result;
  revalidatePath("/cp/submissions");
  return { ok: true, lead_node_id: result.lead_node_id };
}
