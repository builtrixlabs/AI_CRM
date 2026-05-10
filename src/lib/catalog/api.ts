import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertTransitionAllowed, IllegalUnitTransitionError } from "./transitions";
import type { UnitStatus } from "./queries";

/**
 * D-320 — write helpers for property + unit edits.
 *
 *   - Optimistic locking: caller passes `expected_updated_at` from
 *     the row they just rendered; the UPDATE runs only when the
 *     stored timestamp still matches. If a concurrent edit raced us,
 *     UPDATE returns 0 rows -> we surface `error: "stale"`.
 *   - State machine: unit status transitions go through
 *     `assertTransitionAllowed`; backward needs `has_override`.
 *   - Audit trail: one `audit_log` row per save with the diff of
 *     non-equal fields. Empty patches no-op.
 */

const UNIT_STATUSES: ReadonlyArray<UnitStatus> = [
  "available",
  "held",
  "booked",
  "sold",
] as const;

export const unitPatchSchema = z
  .object({
    unit_no: z.string().min(1).max(50).optional(),
    bhk: z.number().int().min(0).max(20).optional(),
    floor: z.number().int().min(-5).max(200).nullable().optional(),
    price: z.number().int().min(0).max(1_000_000_000).optional(),
    carpet_area_sqft: z.number().int().min(0).max(100_000).nullable().optional(),
    status: z.enum(["available", "held", "booked", "sold"]).optional(),
  })
  .strict();

export type UnitPatch = z.infer<typeof unitPatchSchema>;

export const propertyPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    city: z.string().min(1).max(100).optional(),
    address: z.string().min(0).max(500).nullable().optional(),
    rera_number: z.string().min(0).max(100).nullable().optional(),
  })
  .strict();

export type PropertyPatch = z.infer<typeof propertyPatchSchema>;

export type UpdateResult =
  | { ok: true; updated_at: string }
  | { ok: false; error: "stale" | "not_found" | "override_required" | "validation"; message?: string };

type ExistingUnit = {
  state: string | null;
  data: Record<string, unknown> | null;
  updated_at: string;
};

type ExistingProperty = {
  data: Record<string, unknown> | null;
  updated_at: string;
};

const SYSTEM_VIA = "manual";

function diffJson(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (before[k] !== after[k]) {
      out[k] = { from: before[k], to: after[k] };
    }
  }
  return out;
}

export async function updateUnit(
  input: {
    unit_id: string;
    organization_id: string;
    patch: UnitPatch;
    expected_updated_at: string;
    caller_id: string;
    has_override: boolean;
  },
  client: SupabaseClient = getSupabaseAdmin()
): Promise<UpdateResult> {
  const parsed = unitPatchSchema.safeParse(input.patch);
  if (!parsed.success) {
    return { ok: false, error: "validation", message: parsed.error.message };
  }

  // 1. Fetch current row for optimistic-lock + transition check.
  const { data: existing, error: fetchErr } = await client
    .from("nodes")
    .select("state, data, updated_at")
    .eq("id", input.unit_id)
    .eq("organization_id", input.organization_id)
    .eq("node_type", "unit")
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchErr || !existing) {
    return { ok: false, error: "not_found" };
  }

  const cur = existing as ExistingUnit;
  if (cur.updated_at !== input.expected_updated_at) {
    return { ok: false, error: "stale" };
  }

  const curStatus = (UNIT_STATUSES as ReadonlyArray<string>).includes(
    cur.state ?? ""
  )
    ? (cur.state as UnitStatus)
    : "available";

  // 2. State-machine check (only when status is in the patch).
  if (parsed.data.status && parsed.data.status !== curStatus) {
    try {
      assertTransitionAllowed(curStatus, parsed.data.status, input.has_override);
    } catch (err) {
      if (
        err instanceof IllegalUnitTransitionError &&
        err.reason === "backward_no_override"
      ) {
        return { ok: false, error: "override_required" };
      }
      return { ok: false, error: "validation", message: String(err) };
    }
  }

  // 3. Compute the merged data jsonb.
  const beforeData = (cur.data ?? {}) as Record<string, unknown>;
  const dataPatch: Record<string, unknown> = { ...beforeData };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === "status") continue; // status lives on `state` column
    dataPatch[k] = v;
  }

  // 4. UPDATE with the optimistic-lock predicate.
  const nextUpdatedAt = new Date().toISOString();
  const update: Record<string, unknown> = {
    data: dataPatch,
    updated_at: nextUpdatedAt,
    updated_by: input.caller_id,
    updated_via: SYSTEM_VIA,
  };
  if (parsed.data.status) update.state = parsed.data.status;

  const { data: updated, error: updErr } = await client
    .from("nodes")
    .update(update)
    .eq("id", input.unit_id)
    .eq("organization_id", input.organization_id)
    .eq("updated_at", input.expected_updated_at)
    .select("id");
  if (updErr) {
    return { ok: false, error: "validation", message: updErr.message };
  }
  const rows = Array.isArray(updated) ? updated.length : 0;
  if (rows === 0) {
    return { ok: false, error: "stale" };
  }

  // 5. Audit log.
  const afterDiff = diffJson(
    { ...beforeData, status: curStatus },
    { ...dataPatch, status: parsed.data.status ?? curStatus }
  );
  if (Object.keys(afterDiff).length > 0) {
    await client.from("audit_log").insert({
      actor_id: input.caller_id,
      actor_type: "user",
      actor_role: "org_admin",
      organization_id: input.organization_id,
      workspace_id: null,
      table_name: "nodes",
      record_id: input.unit_id,
      action: "unit_edited",
      diff: afterDiff,
    });
  }

  return { ok: true, updated_at: nextUpdatedAt };
}

export async function updateProperty(
  input: {
    property_id: string;
    organization_id: string;
    patch: PropertyPatch;
    expected_updated_at: string;
    caller_id: string;
  },
  client: SupabaseClient = getSupabaseAdmin()
): Promise<UpdateResult> {
  const parsed = propertyPatchSchema.safeParse(input.patch);
  if (!parsed.success) {
    return { ok: false, error: "validation", message: parsed.error.message };
  }

  const { data: existing, error: fetchErr } = await client
    .from("nodes")
    .select("data, updated_at")
    .eq("id", input.property_id)
    .eq("organization_id", input.organization_id)
    .eq("node_type", "property")
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchErr || !existing) return { ok: false, error: "not_found" };
  const cur = existing as ExistingProperty;
  if (cur.updated_at !== input.expected_updated_at) {
    return { ok: false, error: "stale" };
  }

  const beforeData = (cur.data ?? {}) as Record<string, unknown>;
  const dataPatch: Record<string, unknown> = { ...beforeData, ...parsed.data };
  const nextUpdatedAt = new Date().toISOString();

  const { data: updated, error: updErr } = await client
    .from("nodes")
    .update({
      data: dataPatch,
      updated_at: nextUpdatedAt,
      updated_by: input.caller_id,
      updated_via: SYSTEM_VIA,
    })
    .eq("id", input.property_id)
    .eq("organization_id", input.organization_id)
    .eq("updated_at", input.expected_updated_at)
    .select("id");
  if (updErr) {
    return { ok: false, error: "validation", message: updErr.message };
  }
  const rows = Array.isArray(updated) ? updated.length : 0;
  if (rows === 0) return { ok: false, error: "stale" };

  const diff = diffJson(beforeData, dataPatch);
  if (Object.keys(diff).length > 0) {
    await client.from("audit_log").insert({
      actor_id: input.caller_id,
      actor_type: "user",
      actor_role: "org_admin",
      organization_id: input.organization_id,
      workspace_id: null,
      table_name: "nodes",
      record_id: input.property_id,
      action: "property_edited",
      diff,
    });
  }

  return { ok: true, updated_at: nextUpdatedAt };
}
