"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  compileDag,
  createNewVersion,
  revertToVersion,
  sandboxRun,
  type CompiledDag,
  type SandboxNodeTrace,
} from "@/lib/workflow-builder";

export type BuilderActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      reason: "permission" | "validation" | "not_found" | "test_required" | "internal";
      message?: string;
    };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Gated =
  | { ok: true; user_id: string; org_id: string; can_approve: boolean }
  | { ok: false; reason: "permission" };

async function gateAuthor(): Promise<Gated> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, reason: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("directives:author")) return { ok: false, reason: "permission" };
  return {
    ok: true,
    user_id: user.user.id,
    org_id: user.org_id,
    can_approve: perms.has("directives:approve"),
  };
}

/**
 * Persist a compiled DAG to `directives.compiled_dag`. Wipes
 * `last_test_passed_at` (the operator must re-Test before Publish).
 */
export async function saveDagAction(
  directive_id: string,
  dag_input: { nodes: unknown; edges: unknown },
): Promise<BuilderActionResult<{ id: string }>> {
  const g = await gateAuthor();
  if (!g.ok) return g;
  if (!UUID_RE.test(directive_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const compiled = compileDag({
    nodes: (dag_input.nodes as never) ?? [],
    edges: (dag_input.edges as never) ?? [],
  });
  if (!compiled.ok) {
    return { ok: false, reason: "validation", message: compiled.error.code };
  }
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("directives")
    .update({
      compiled_dag: compiled.dag,
      last_test_passed_at: null,
      updated_at: new Date().toISOString(),
      updated_by: g.user_id,
    })
    .eq("id", directive_id)
    .eq("organization_id", g.org_id)
    .select("id");
  if (error) return { ok: false, reason: "internal", message: error.message };
  if (!data || data.length === 0) return { ok: false, reason: "not_found" };
  revalidatePath(`/admin/directives/${directive_id}/builder`);
  return { ok: true, data: { id: directive_id } };
}

/**
 * Run the sandbox against the persisted DAG. On success, stamp
 * `last_test_passed_at = now()` so Publish unlocks.
 */
export async function sandboxTestAction(
  directive_id: string,
  sample_payload: Record<string, unknown>,
  payload_name?: string,
): Promise<
  | BuilderActionResult<{ trace: SandboxNodeTrace[] }>
  | { ok: false; reason: "no_dag"; message?: string }
> {
  const g = await gateAuthor();
  if (!g.ok) return g;
  if (!UUID_RE.test(directive_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const client = getSupabaseAdmin();
  const { data } = await client
    .from("directives")
    .select("compiled_dag, test_payloads")
    .eq("id", directive_id)
    .eq("organization_id", g.org_id)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as {
    compiled_dag: CompiledDag | null;
    test_payloads: unknown[] | null;
  };
  if (!row.compiled_dag) {
    return { ok: false, reason: "no_dag" };
  }
  const result = sandboxRun(row.compiled_dag, sample_payload);
  if (!result.ok) {
    return { ok: false, reason: "validation", message: result.error };
  }

  // LRU update: prepend, dedup by name, cap at 5.
  const entry = {
    name: payload_name ?? "(unnamed)",
    payload: sample_payload,
    last_run_at: new Date().toISOString(),
    last_run_ok: true,
  };
  const existing = (row.test_payloads ?? []) as Array<{ name: string }>;
  const dedup = existing.filter((e) => e.name !== entry.name);
  const nextPayloads = [entry, ...dedup].slice(0, 5);

  await client
    .from("directives")
    .update({
      test_payloads: nextPayloads,
      last_test_passed_at: new Date().toISOString(),
    })
    .eq("id", directive_id)
    .eq("organization_id", g.org_id);

  revalidatePath(`/admin/directives/${directive_id}/builder`);
  return { ok: true, data: { trace: result.trace } };
}

/**
 * Publish the current draft. Gates on `last_test_passed_at > updated_at`
 * (a successful Test in the current edit session). For managers, the
 * lifecycle transitions to `pending_approval` per D-615; for org_admins,
 * directly to `live` (and any prior live with the same `code` is
 * demoted to `archived`).
 */
export async function publishWorkflowAction(
  directive_id: string,
): Promise<BuilderActionResult> {
  const g = await gateAuthor();
  if (!g.ok) return g;
  if (!UUID_RE.test(directive_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const client = getSupabaseAdmin();
  const { data } = await client
    .from("directives")
    .select("id, code, updated_at, last_test_passed_at, lifecycle_status")
    .eq("id", directive_id)
    .eq("organization_id", g.org_id)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as {
    id: string;
    code: string;
    updated_at: string;
    last_test_passed_at: string | null;
    lifecycle_status: string;
  };
  if (
    !row.last_test_passed_at ||
    Date.parse(row.last_test_passed_at) <= Date.parse(row.updated_at)
  ) {
    return { ok: false, reason: "test_required" };
  }

  const targetStatus = g.can_approve ? "live" : "pending_approval";
  const update: Record<string, unknown> = {
    lifecycle_status: targetStatus,
  };
  if (targetStatus === "live") {
    update.enabled = true;
  }

  // Demote prior live in this code chain (only if we're going live now).
  if (targetStatus === "live") {
    await client
      .from("directives")
      .update({ lifecycle_status: "archived", enabled: false })
      .eq("organization_id", g.org_id)
      .eq("code", row.code)
      .eq("lifecycle_status", "live")
      .neq("id", row.id);
  }

  const upd = await client
    .from("directives")
    .update(update)
    .eq("id", row.id)
    .eq("organization_id", g.org_id);
  if (upd.error) {
    return { ok: false, reason: "internal", message: upd.error.message };
  }
  revalidatePath(`/admin/directives/${directive_id}/builder`);
  revalidatePath("/admin/directives");
  return { ok: true };
}

export async function newVersionAction(
  directive_id: string,
): Promise<BuilderActionResult<{ id: string }>> {
  const g = await gateAuthor();
  if (!g.ok) return g;
  if (!UUID_RE.test(directive_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await createNewVersion({
    caller_org_id: g.org_id,
    source_id: directive_id,
    actor_id: g.user_id,
  });
  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    return { ok: false, reason: "internal", message: r.reason };
  }
  revalidatePath("/admin/directives");
  return { ok: true, data: { id: r.id } };
}

export async function revertVersionAction(
  target_id: string,
): Promise<BuilderActionResult> {
  const g = await gateAuthor();
  if (!g.ok) return g;
  if (!UUID_RE.test(target_id)) {
    return { ok: false, reason: "validation", message: "bad_id" };
  }
  const r = await revertToVersion({
    caller_org_id: g.org_id,
    target_id,
  });
  if (!r.ok) {
    if (r.reason === "not_found") return { ok: false, reason: "not_found" };
    return { ok: false, reason: "internal", message: r.reason };
  }
  revalidatePath("/admin/directives");
  return { ok: true };
}
