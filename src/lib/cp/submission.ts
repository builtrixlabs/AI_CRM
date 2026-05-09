import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createLead } from "@/lib/leads/api";
import { updateNodeData } from "@/lib/nodes/api";
import { dispatchDirective } from "@/lib/doe/runtime";

export type CpStatus = "pending" | "accepted" | "converted" | "rejected";

export type CpSubmissionInput = {
  organization_id: string;
  user_id: string;
  phone: string;
  email?: string | null;
  source_property?: string | null;
  expected_budget?: string | null;
  notes?: string | null;
};

export type CpSubmissionRow = {
  id: string;
  created_at: string;
  phone: string;
  state: string;
  source_property: string | null;
  expected_budget: string | null;
  cp_status: CpStatus;
};

export type CpSubmissionResult =
  | { ok: true; lead_node_id: string }
  | { ok: false; error: "no_workspace" | "internal"; message?: string };

/**
 * Resolve the org's first non-deleted workspace. CP users typically have no
 * app_role bridge entries, so we attach their submissions to the org default.
 */
async function getDefaultWorkspaceId(
  client: SupabaseClient,
  organization_id: string
): Promise<string | null> {
  const { data, error } = await client
    .from("workspaces")
    .select("id")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as { id: string }).id;
}

export async function submitCpLead(
  input: CpSubmissionInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<CpSubmissionResult> {
  const workspace_id = await getDefaultWorkspaceId(
    client,
    input.organization_id
  );
  if (!workspace_id) {
    return {
      ok: false,
      error: "no_workspace",
      message:
        "Org has no workspace yet. Ask an org admin to finish onboarding first.",
    };
  }

  let lead_node_id: string;
  try {
    const lead = await createLead(
      {
        organization_id: input.organization_id,
        workspace_id,
        created_by: input.user_id,
        data: {
          phone: input.phone,
          source: "channel_partner",
          email: input.email ?? undefined,
          notes: input.notes ?? undefined,
          label: input.source_property
            ? `${input.phone} · ${input.source_property}`
            : input.phone,
        },
      },
      client
    );
    lead_node_id = lead.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: "internal", message };
  }

  // Attach CP-specific custom data after the createLead call so the standard
  // schema validation stays clean. updateNodeData merges shallowly — `custom`
  // overwrites whole, so we don't need to read first (new lead has no custom).
  await updateNodeData(
    {
      id: lead_node_id,
      partial: {
        custom: {
          cp_submitted_by: input.user_id,
          cp_status: "pending" satisfies CpStatus,
          source_property: input.source_property ?? null,
          expected_budget: input.expected_budget ?? null,
        },
      },
      updated_by: input.user_id,
      updated_via: "cp_portal",
    },
    client
  );

  // Fire DOE D-11 (cp.lead_submitted → notify CP coordinator). Best-effort —
  // the lead persists either way.
  try {
    await dispatchDirective(
      {
        kind: "cp.lead_submitted",
        trigger_id: `cp.lead_submitted:${lead_node_id}`,
        organization_id: input.organization_id,
        workspace_id,
        subject_node_id: lead_node_id,
        payload: {
          lead_id: lead_node_id,
          cp_user_id: input.user_id,
        },
      },
      { client }
    );
  } catch {
    // Don't fail the submission if DOE wiring hiccups.
  }

  return { ok: true, lead_node_id };
}

export async function listCpSubmissions(
  organization_id: string,
  cp_user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<CpSubmissionRow[]> {
  const { data, error } = await client
    .from("nodes")
    .select("id, created_at, state, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .eq("data->custom->>cp_submitted_by", cp_user_id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];

  return (data as Array<{
    id: string;
    created_at: string;
    state: string;
    data: {
      phone?: string;
      custom?: {
        cp_status?: CpStatus;
        source_property?: string | null;
        expected_budget?: string | null;
      };
    };
  }>).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    phone: r.data?.phone ?? "—",
    state: r.state,
    source_property: r.data?.custom?.source_property ?? null,
    expected_budget: r.data?.custom?.expected_budget ?? null,
    cp_status: r.data?.custom?.cp_status ?? "pending",
  }));
}
