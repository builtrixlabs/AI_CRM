import type { SupabaseClient } from "@supabase/supabase-js";
import { createNode, NodeValidationError } from "@/lib/nodes/api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createLeadInputSchema, type CreateLeadInput } from "./schemas";
import {
  TERMINAL_STATES,
  assertTransitionAllowed,
  type LeadState,
} from "./transitions";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type CreateLeadArgs = {
  organization_id: string;
  workspace_id: string;
  created_by: string;
  /** Optional override; defaults to phone. */
  label?: string;
  data: CreateLeadInput;
};

/**
 * Create a `node_type='lead'` row in state='new' via D-002's createNode.
 * Validates the lead-specific data with Zod first; throws NodeValidationError
 * (or any DB error) on failure. Writes one audit_log row through createNode.
 */
export async function createLead(
  args: CreateLeadArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string }> {
  const parsed = createLeadInputSchema.safeParse(args.data);
  if (!parsed.success) {
    throw new NodeValidationError(parsed.error.issues);
  }
  const data = parsed.data;
  const { label: dataLabel, ...rest } = data;
  const label = args.label ?? dataLabel ?? data.phone;
  return createNode(
    {
      organization_id: args.organization_id,
      workspace_id: args.workspace_id,
      node_type: "lead",
      label,
      data: rest,
      state: "new",
      created_by: args.created_by,
      created_via: "manual",
    },
    client,
  );
}

export type TransitionLeadArgs = {
  lead_id: string;
  target_state: LeadState;
  actor: string;
  reason?: string;
};

/**
 * Move a lead's `state` to `target_state` and write one audit_log row with
 * `action='state_change'` and `diff: { from, to, reason? }`.
 *
 * Path bypasses D-002's `updateNodeData` because the audit diff shape differs
 * (`{from,to}` vs `{before,after}`). Documented in memory/decisions.md (D-007).
 *
 * Throws:
 *   - generic Error on malformed lead_id
 *   - generic Error on missing reason for terminal targets
 *   - generic Error if the lead row isn't visible (cross-tenant or missing)
 *   - IllegalTransitionError on disallowed (from, to) pair
 *   - any DB error on UPDATE failure
 */
export async function transitionLead(
  args: TransitionLeadArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  if (!UUID_RE.test(args.lead_id)) {
    throw new Error(`Malformed lead_id: ${args.lead_id}`);
  }
  if (TERMINAL_STATES.has(args.target_state)) {
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Reason is required for terminal transitions");
    }
  }

  const lookup = await client
    .from("nodes")
    .select("state, organization_id, workspace_id")
    .eq("id", args.lead_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .maybeSingle();

  const current = (lookup as { data: { state: string; organization_id: string; workspace_id: string } | null }).data;
  if (!current) {
    throw new Error(`Lead not found or not visible: ${args.lead_id}`);
  }

  const from = current.state as LeadState;
  assertTransitionAllowed(from, args.target_state);

  const updResult = await client
    .from("nodes")
    .update({
      state: args.target_state,
      updated_at: new Date().toISOString(),
      updated_by: args.actor,
      updated_via: "manual",
    })
    .eq("id", args.lead_id);

  const updErr = (updResult as { error: { message: string } | null }).error;
  if (updErr) throw new Error(updErr.message);

  const reasonForDiff = args.reason?.trim();
  await client.from("audit_log").insert({
    actor_id: args.actor,
    actor_type: "user",
    actor_role: "lead_writer",
    workspace_id: current.workspace_id,
    organization_id: current.organization_id,
    table_name: "nodes",
    record_id: args.lead_id,
    action: "state_change",
    diff: reasonForDiff
      ? { from, to: args.target_state, reason: reasonForDiff }
      : { from, to: args.target_state },
  });
}
