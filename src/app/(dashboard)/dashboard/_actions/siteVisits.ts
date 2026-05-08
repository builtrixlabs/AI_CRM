"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSiteVisit } from "@/lib/sitevisits/api";
import { NodeValidationError } from "@/lib/nodes/api";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const scheduleSchema = z.object({
  lead_id: z.string().regex(UUID_RE),
  scheduled_at: z.string().datetime(),
  notes: z.string().optional(),
});

export type ScheduleSiteVisitResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: "permission" | "validation" | "unknown"; message?: string };

async function leadInTenant(
  lead_id: string,
  caller_org_id: string
): Promise<{ workspace_id: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nodes")
    .select("workspace_id")
    .eq("id", lead_id)
    .eq("node_type", "lead")
    .eq("organization_id", caller_org_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return { workspace_id: (data as { workspace_id: string }).workspace_id };
}

export async function scheduleSiteVisit(
  formData: FormData
): Promise<ScheduleSiteVisitResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("leads:edit")) return { ok: false, error: "permission" };

  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }

  const payload = {
    lead_id: String(formData.get("lead_id") ?? ""),
    scheduled_at: String(formData.get("scheduled_at") ?? ""),
    notes:
      typeof formData.get("notes") === "string"
        ? String(formData.get("notes"))
        : undefined,
  };
  const parsed = scheduleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "validation", message: parsed.error.issues[0]?.message };
  }

  const tenant = await leadInTenant(parsed.data.lead_id, user.org_id);
  if (!tenant) {
    return { ok: false, error: "validation", message: "Lead not found" };
  }

  try {
    const result = await createSiteVisit({
      organization_id: user.org_id,
      workspace_id: tenant.workspace_id,
      created_by: user.user.id,
      lead_id: parsed.data.lead_id,
      scheduled_at: parsed.data.scheduled_at,
      notes: parsed.data.notes,
    });
    revalidatePath(`/dashboard/leads/${parsed.data.lead_id}`);
    return { ok: true, data: { id: result.id } };
  } catch (err) {
    if (err instanceof NodeValidationError) {
      return { ok: false, error: "validation", message: err.message };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown",
    };
  }
}
