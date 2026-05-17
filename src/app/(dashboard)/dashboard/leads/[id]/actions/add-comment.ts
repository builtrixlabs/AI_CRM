"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { noteSchema } from "@/lib/nodes/schemas/note";

/**
 * v6.2.1 — append a new comment (note node) to a lead's Comments thread.
 *
 * Gate: notes:create (already in the sales_rep operational baseline).
 * Writes: nodes row with node_type='note', data: { body, lead_id }.
 * The Comments tab reads notes via getLeadCanvasV2's safeRows fetch
 * (filtered by data->>lead_id).
 *
 * No edge is created — the note knows its lead via data.lead_id, the same
 * pattern site_visits use. This keeps the read path index-friendly.
 */

export type AddCommentResult =
  | { ok: true; comment_id: string }
  | {
      ok: false;
      error: "permission" | "not_found" | "validation" | "internal";
      message?: string;
    };

export async function addCommentAction(
  lead_id: string,
  body: string,
): Promise<AddCommentResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, error: "permission" };

  const perms = resolveForUser(user);
  if (!perms.has("notes:create")) {
    return { ok: false, error: "permission" };
  }

  const trimmed = body.trim();
  if (trimmed.length < 1) {
    return { ok: false, error: "validation", message: "empty_body" };
  }
  if (trimmed.length > 4000) {
    return { ok: false, error: "validation", message: "body_too_long" };
  }

  // Schema-check the payload before insert. Any future noteSchema field
  // requirement gets enforced here without a code change in this file.
  const parsed = noteSchema.safeParse({ body: trimmed, lead_id });
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: parsed.error.issues[0]?.message ?? "invalid",
    };
  }

  const admin = getSupabaseAdmin();

  // Confirm the lead exists in this org before writing the note — avoids
  // orphan notes if a bad lead_id is passed.
  const { data: lead } = await admin
    .from("nodes")
    .select("id, workspace_id, organization_id")
    .eq("id", lead_id)
    .eq("organization_id", user.org_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead) return { ok: false, error: "not_found" };
  const leadRow = lead as {
    id: string;
    workspace_id: string;
    organization_id: string;
  };

  const { data: ins, error } = await admin
    .from("nodes")
    .insert({
      organization_id: leadRow.organization_id,
      workspace_id: leadRow.workspace_id,
      node_type: "note",
      label: trimmed.slice(0, 80),
      state: null,
      data: { body: trimmed, lead_id },
      created_by: user.user.id,
      created_via: "manual",
      updated_by: user.user.id,
      updated_via: "manual",
    })
    .select("id")
    .single();
  if (error || !ins) {
    return {
      ok: false,
      error: "internal",
      message: error?.message ?? "insert_failed",
    };
  }

  const comment_id = (ins as { id: string }).id;

  await admin.from("audit_log").insert({
    actor_id: user.user.id,
    actor_type: "user",
    actor_role: "sales_rep",
    organization_id: user.org_id,
    workspace_id: leadRow.workspace_id,
    table_name: "nodes",
    record_id: comment_id,
    action: "comment_added",
    diff: { lead_id, len: trimmed.length },
  });

  revalidatePath(`/dashboard/leads/${lead_id}`);
  return { ok: true, comment_id };
}
