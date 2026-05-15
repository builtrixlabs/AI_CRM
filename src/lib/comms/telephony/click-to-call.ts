// D-609 (V6 Phase 2) — Click-to-Call on Canvas.
//
// initiateClickToCall: resolve the lead → resolve the org's telephony
// adapter → place an Exotel-bridged call (rep phone → customer phone) →
// write a `call.initiated` activity node on the lead.
// recordCallStatusUpdate: the D-433 call-status webhook's real wiring —
// find that activity node by provider_call_id and patch its disposition.
//
// Both are org-scoped throughout (the service-role client bypasses RLS,
// so the organization_id filter is the load-bearing tenant guard) and
// take an injectable client for tests.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveOrgAdapter } from "@/lib/comms/resolve-org-adapter";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Stable service-account uuid for webhook-driven status updates. */
export const CLICK_TO_CALL_SERVICE_ACCOUNT =
  "00000000-0000-4000-8000-000000000004";

export type InitiateClickToCallArgs = {
  organization_id: string;
  lead_id: string;
  from_user_id: string;
  /** The rep's own phone — read from profiles.phone, never client input. */
  from_phone_e164: string;
};

export type InitiateClickToCallResult =
  | {
      ok: true;
      provider_call_id: string;
      activity_id: string;
      provider: string;
    }
  | {
      ok: false;
      reason:
        | "lead_not_found"
        | "no_lead_phone"
        | "not_configured"
        | "provider_error";
      message?: string;
    };

/**
 * Place an outbound click-to-call and record it as a `call.initiated`
 * activity node on the lead. Org-scoped: the lead resolve and the adapter
 * resolve both carry `organization_id`, so org A can never call against an
 * org-B lead or with org B's Exotel credentials.
 */
export async function initiateClickToCall(
  args: InitiateClickToCallArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<InitiateClickToCallResult> {
  if (!UUID_RE.test(args.lead_id)) {
    return { ok: false, reason: "lead_not_found" };
  }

  // 1. Resolve the lead — org-scoped (the tenant guard on a service-role read).
  const { data: leadRow } = await client
    .from("nodes")
    .select("id, label, data, workspace_id")
    .eq("id", args.lead_id)
    .eq("organization_id", args.organization_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .maybeSingle();
  if (!leadRow) return { ok: false, reason: "lead_not_found" };
  const lead = leadRow as {
    id: string;
    label: string;
    data: Record<string, unknown> | null;
    workspace_id: string;
  };
  const toPhone =
    (lead.data?.phone as string | undefined) ??
    (lead.data?.contact_phone as string | undefined);
  if (!toPhone || !toPhone.trim()) {
    return { ok: false, reason: "no_lead_phone" };
  }

  // 2. Resolve the org's telephony adapter.
  const resolved = await resolveOrgAdapter(
    "telephony",
    args.organization_id,
    client,
  );
  if (!resolved.ok) {
    return resolved.reason === "not_configured"
      ? { ok: false, reason: "not_configured" }
      : { ok: false, reason: "provider_error", message: resolved.message };
  }

  // 3. Place the call — rep phone bridged to the customer.
  let provider_call_id: string;
  try {
    const r = await resolved.adapter.outboundClickToCall({
      organization_id: args.organization_id,
      workspace_id: lead.workspace_id,
      from_user_id: args.from_user_id,
      from_phone_e164: args.from_phone_e164,
      to_phone_e164: toPhone,
      lead_id: lead.id,
    });
    provider_call_id = r.provider_call_id;
  } catch (err) {
    return {
      ok: false,
      reason: "provider_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. Activity node + edge + audit.
  const actIns = await client
    .from("nodes")
    .insert({
      organization_id: args.organization_id,
      workspace_id: lead.workspace_id,
      node_type: "activity",
      label: "Call initiated",
      state: null,
      data: {
        kind: "call",
        direction: "outbound",
        provider: resolved.provider,
        provider_call_id,
        status: "initiated",
        from_user_id: args.from_user_id,
        to_phone: toPhone,
        summary: `Click-to-call placed via ${resolved.provider}`,
      },
      created_by: args.from_user_id,
      created_via: "click_to_call",
      updated_by: args.from_user_id,
      updated_via: "click_to_call",
    })
    .select("id")
    .single();
  const actErr = (actIns as { error: { message: string } | null }).error;
  if (actErr) {
    return {
      ok: false,
      reason: "provider_error",
      message: `call placed but activity write failed: ${actErr.message}`,
    };
  }
  const activity_id = (actIns as { data: { id: string } }).data.id;

  await client.from("edges").insert({
    organization_id: args.organization_id,
    workspace_id: lead.workspace_id,
    from_node_id: activity_id,
    to_node_id: lead.id,
    edge_type: "describes",
    created_by: args.from_user_id,
    created_via: "click_to_call",
    updated_by: args.from_user_id,
    updated_via: "click_to_call",
  });

  await client.from("audit_log").insert({
    actor_id: args.from_user_id,
    actor_type: "user",
    actor_role: "telephony_caller",
    organization_id: args.organization_id,
    workspace_id: lead.workspace_id,
    table_name: "nodes",
    record_id: activity_id,
    action: "call_initiated",
    diff: {
      lead_id: lead.id,
      provider: resolved.provider,
      provider_call_id,
    },
  });

  return {
    ok: true,
    provider_call_id,
    activity_id,
    provider: resolved.provider,
  };
}

/** Map an Exotel `Status` callback value to a CRM call status string. */
export function mapExotelStatus(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === "completed") return "completed";
  if (s === "busy") return "busy";
  if (s === "no-answer" || s === "no_answer") return "no_answer";
  if (s === "failed") return "failed";
  if (s === "in-progress" || s === "ringing") return "ringing";
  if (s === "queued") return "initiated";
  return s || "unknown";
}

export type CallStatusUpdate = {
  organization_id: string;
  provider_call_id: string;
  status: string;
  duration_s?: number | null;
};

/**
 * The D-433 call-status webhook's real wiring. Find the `call.initiated`
 * activity node by `provider_call_id` (org-scoped) and patch its
 * disposition. An unknown `provider_call_id` (a call placed out-of-band,
 * or a webhook replay) is a benign no-op — webhooks must be idempotent
 * and tolerant, never 4xx/5xx on an unrecognized id.
 */
export async function recordCallStatusUpdate(
  update: CallStatusUpdate,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ ok: true; updated: boolean }> {
  const { data: nodeRow } = await client
    .from("nodes")
    .select("id, data, workspace_id")
    .eq("organization_id", update.organization_id)
    .eq("node_type", "activity")
    .eq("data->>provider_call_id", update.provider_call_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!nodeRow) return { ok: true, updated: false };

  const node = nodeRow as {
    id: string;
    data: Record<string, unknown> | null;
    workspace_id: string | null;
  };
  const nowIso = new Date().toISOString();
  const newData: Record<string, unknown> = {
    ...(node.data ?? {}),
    status: update.status,
    status_updated_at: nowIso,
    summary: `Call ${update.status}`,
  };
  if (update.duration_s != null) newData.duration_s = update.duration_s;

  await client
    .from("nodes")
    .update({
      data: newData,
      label: `Call ${update.status}`,
      updated_at: nowIso,
      updated_by: CLICK_TO_CALL_SERVICE_ACCOUNT,
      updated_via: "telephony_webhook",
    })
    .eq("id", node.id)
    .eq("organization_id", update.organization_id);

  await client.from("audit_log").insert({
    actor_id: CLICK_TO_CALL_SERVICE_ACCOUNT,
    actor_type: "system",
    actor_role: "telephony_webhook",
    organization_id: update.organization_id,
    workspace_id: node.workspace_id,
    table_name: "nodes",
    record_id: node.id,
    action: "call_status_update",
    diff: {
      provider_call_id: update.provider_call_id,
      status: update.status,
      duration_s: update.duration_s ?? null,
    },
  });

  return { ok: true, updated: true };
}
