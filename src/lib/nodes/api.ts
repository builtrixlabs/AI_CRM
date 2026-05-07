import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { nodeSchemaFor } from "./schemas";
import { validateState } from "./states";
import type { CreatedVia, NodeType } from "./types";

export class NodeValidationError extends Error {
  constructor(public readonly issues: ZodError["issues"]) {
    super(`NodeValidationError: ${issues.length} issue(s)`);
    this.name = "NodeValidationError";
  }
}

export class NodeStateError extends Error {
  constructor(node_type: NodeType, state: string | null | undefined) {
    super(`Invalid state '${state ?? "<null>"}' for node_type '${node_type}'`);
    this.name = "NodeStateError";
  }
}

export type CreateNodeInput = {
  organization_id: string;
  workspace_id: string;
  node_type: NodeType;
  label: string;
  data: unknown;
  state?: string | null;
  created_via?: CreatedVia;
  created_by: string;
  source_event_id?: string | null;
  ai_confidence?: number | null;
};

/**
 * Insert a node + write the audit row.
 *
 * Caller responsibilities:
 *   - `organization_id` MUST match the authenticated user's org. We do not
 *     re-check here; the caller (server action / API route) verifies via
 *     getCurrentUser() before invoking.
 *   - `created_by` MUST be either auth.uid() or the service-account id of an
 *     agent acting on behalf of a human (Constitution I — bounded authority).
 *
 * The function uses the service-role client because (a) audit_log requires it
 * and (b) atomically inserting node + audit row through one client simplifies
 * the failure model.
 */
export async function createNode(
  input: CreateNodeInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<{ id: string }> {
  const schema = nodeSchemaFor(input.node_type);
  const parsed = schema.safeParse(input.data);
  if (!parsed.success) throw new NodeValidationError(parsed.error.issues);

  if (input.state !== undefined) {
    if (!validateState(input.node_type, input.state)) {
      throw new NodeStateError(input.node_type, input.state);
    }
  }

  const created_via: CreatedVia = input.created_via ?? "manual";

  const { data: row, error } = await client
    .from("nodes")
    .insert({
      organization_id: input.organization_id,
      workspace_id: input.workspace_id,
      node_type: input.node_type,
      label: input.label,
      data: parsed.data,
      state: input.state ?? null,
      created_by: input.created_by,
      created_via,
      updated_by: input.created_by,
      updated_via: created_via,
      source_event_id: input.source_event_id ?? null,
      ai_confidence: input.ai_confidence ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await client.from("audit_log").insert({
    actor_id: input.created_by,
    actor_type: "user",
    actor_role: "node_writer",
    workspace_id: input.workspace_id,
    organization_id: input.organization_id,
    table_name: "nodes",
    record_id: row.id,
    action: "node_create",
    diff: { after: parsed.data, label: input.label, state: input.state ?? null },
  });

  return { id: row.id };
}

export type UpdateNodeDataInput = {
  id: string;
  partial: Record<string, unknown>;
  updated_by: string;
  updated_via?: CreatedVia;
  state?: string | null;
};

/**
 * Merge `partial` into a node's existing `data`, validate the result against
 * the type's Zod schema, then UPDATE. Writes audit row with before/after diff.
 */
export async function updateNodeData(
  input: UpdateNodeDataInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const { data: existing, error: readErr } = await client
    .from("nodes")
    .select("id, organization_id, workspace_id, node_type, data, state")
    .eq("id", input.id)
    .single();
  if (readErr) throw readErr;
  if (!existing) throw new Error(`Node ${input.id} not found`);

  const merged = { ...(existing.data as Record<string, unknown>), ...input.partial };
  const schema = nodeSchemaFor(existing.node_type as NodeType);
  const parsed = schema.safeParse(merged);
  if (!parsed.success) throw new NodeValidationError(parsed.error.issues);

  if (input.state !== undefined) {
    if (!validateState(existing.node_type as NodeType, input.state)) {
      throw new NodeStateError(existing.node_type as NodeType, input.state);
    }
  }

  const updated_via: CreatedVia = input.updated_via ?? "manual";
  const { error: updErr } = await client
    .from("nodes")
    .update({
      data: parsed.data,
      state: input.state ?? existing.state,
      updated_at: new Date().toISOString(),
      updated_by: input.updated_by,
      updated_via,
    })
    .eq("id", input.id);
  if (updErr) throw updErr;

  await client.from("audit_log").insert({
    actor_id: input.updated_by,
    actor_type: "user",
    actor_role: "node_writer",
    workspace_id: existing.workspace_id,
    organization_id: existing.organization_id,
    table_name: "nodes",
    record_id: input.id,
    action: "node_update",
    diff: { before: existing.data, after: parsed.data },
  });
}

export type SoftDeleteNodeInput = {
  id: string;
  deleted_by: string;
  reason: string;
};

/**
 * Mark the node deleted (soft-delete only). The trigger does NOT enqueue an
 * embedding refresh because deleted_at is not in the trigger's UPDATE OF list.
 */
export async function softDeleteNode(
  input: SoftDeleteNodeInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const { data: existing, error: readErr } = await client
    .from("nodes")
    .select("id, organization_id, workspace_id, deleted_at")
    .eq("id", input.id)
    .single();
  if (readErr) throw readErr;
  if (existing.deleted_at) return; // idempotent

  const { error } = await client
    .from("nodes")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: input.deleted_by,
      deleted_reason: input.reason,
      updated_at: new Date().toISOString(),
      updated_by: input.deleted_by,
      updated_via: "manual",
    })
    .eq("id", input.id);
  if (error) throw error;

  await client.from("audit_log").insert({
    actor_id: input.deleted_by,
    actor_type: "user",
    actor_role: "node_writer",
    workspace_id: existing.workspace_id,
    organization_id: existing.organization_id,
    table_name: "nodes",
    record_id: input.id,
    action: "node_delete",
    diff: { reason: input.reason },
  });
}
