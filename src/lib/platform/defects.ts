/**
 * D-606 — platform defects: lightweight incident tracker. CRUD only,
 * no workflow engine. Gated on `platform:manage` at the action layer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const DEFECT_SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DEFECT_STATUSES = [
  "open",
  "triaged",
  "in_progress",
  "resolved",
  "wont_fix",
] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

const TERMINAL_STATUSES: ReadonlySet<DefectStatus> = new Set(["resolved", "wont_fix"]);

export type PlatformDefect = {
  id: string;
  organization_id: string | null;
  severity: DefectSeverity;
  title: string;
  description: string;
  status: DefectStatus;
  assigned_to: string | null;
  related_audit_ids: string[];
  created_by: string;
  created_at: string;
  resolved_at: string | null;
};

export type CreateDefectInput = {
  organization_id?: string | null;
  severity: DefectSeverity;
  title: string;
  description: string;
  related_audit_ids?: string[];
  created_by: string;
};

export async function createDefect(
  input: CreateDefectInput,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<
  | { ok: true; id: string }
  | { ok: false; reason: "validation" | string }
> {
  if (!input.title?.trim() || !input.description?.trim()) {
    return { ok: false, reason: "validation" };
  }
  if (!DEFECT_SEVERITIES.includes(input.severity)) {
    return { ok: false, reason: "validation" };
  }
  const { data, error } = await client
    .from("platform_defects")
    .insert({
      organization_id: input.organization_id ?? null,
      severity: input.severity,
      title: input.title.trim(),
      description: input.description.trim(),
      related_audit_ids: input.related_audit_ids ?? [],
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export type UpdateDefectInput = {
  id: string;
  severity?: DefectSeverity;
  title?: string;
  description?: string;
  status?: DefectStatus;
  assigned_to?: string | null;
  related_audit_ids?: string[];
};

export async function updateDefect(
  input: UpdateDefectInput,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "validation" | string }> {
  const patch: Record<string, unknown> = {};
  if (input.severity !== undefined) {
    if (!DEFECT_SEVERITIES.includes(input.severity)) {
      return { ok: false, reason: "validation" };
    }
    patch.severity = input.severity;
  }
  if (input.title !== undefined) {
    if (!input.title.trim()) return { ok: false, reason: "validation" };
    patch.title = input.title.trim();
  }
  if (input.description !== undefined) {
    if (!input.description.trim()) return { ok: false, reason: "validation" };
    patch.description = input.description.trim();
  }
  if (input.status !== undefined) {
    if (!DEFECT_STATUSES.includes(input.status)) {
      return { ok: false, reason: "validation" };
    }
    patch.status = input.status;
    // Auto-set resolved_at when transitioning to a terminal status; clear
    // it on transition out of one.
    if (TERMINAL_STATUSES.has(input.status)) {
      patch.resolved_at = new Date().toISOString();
    } else {
      patch.resolved_at = null;
    }
  }
  if (input.assigned_to !== undefined) {
    patch.assigned_to = input.assigned_to;
  }
  if (input.related_audit_ids !== undefined) {
    patch.related_audit_ids = input.related_audit_ids;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const { data, error } = await client
    .from("platform_defects")
    .update(patch)
    .eq("id", input.id)
    .select("id");
  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

export async function getDefect(
  id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<PlatformDefect | null> {
  const { data } = await client
    .from("platform_defects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as PlatformDefect | null) ?? null;
}

export async function listDefects(args: {
  status?: DefectStatus;
  organization_id?: string;
  limit?: number;
  client?: SupabaseClient;
}): Promise<PlatformDefect[]> {
  const client = args.client ?? getSupabaseAdmin();
  let q = client.from("platform_defects").select("*");
  if (args.status) q = q.eq("status", args.status);
  if (args.organization_id) q = q.eq("organization_id", args.organization_id);
  q = q.order("created_at", { ascending: false }).limit(args.limit ?? 100);
  const { data } = await q;
  return (data ?? []) as PlatformDefect[];
}
