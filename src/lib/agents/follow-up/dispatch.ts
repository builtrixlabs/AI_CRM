// D-415 — auto-dispatch an approved follow-up draft via the per-channel
// adapter (D-418 shells). Idempotent. On success: status approved → sent,
// activity node + audit row written. On error: send_error recorded, status
// stays approved so operator can retry by re-approving.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CommsError } from "@/lib/comms/types";
import { resolveOrgAdapter } from "@/lib/comms/resolve-org-adapter";
import {
  FOLLOW_UP_DLT_TEMPLATES,
  FOLLOW_UP_DLT_TEMPLATE_IDS,
  FOLLOW_UP_WA_TEMPLATES,
} from "./dlt";

export const FOLLOW_UP_SERVICE_ACCOUNT =
  "00000000-0000-4000-8000-000000000002";

export type DispatchArgs = {
  queue_id: string;
  organization_id: string;
  actor_id: string;
};

export type DispatchResult =
  | {
      ok: true;
      status: "sent";
      provider: string;
      provider_message_id: string;
      activity_id: string;
    }
  | { ok: true; already_sent: true }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_approved"
        | "missing_recipient"
        | "not_configured"
        | "provider_error";
      message?: string;
    };

function errToMessage(err: unknown): string {
  return err instanceof CommsError
    ? `${err.kind}: ${err.message}`
    : err instanceof Error
      ? err.message
      : "Unknown send error";
}

export async function dispatchApprovedDraft(
  args: DispatchArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<DispatchResult> {
  // 1. Fetch queue row (cross-tenant guard via .eq org).
  const { data: rowData, error: rowErr } = await client
    .from("agent_approval_queue")
    .select(
      "id, organization_id, workspace_id, lead_id, agent_kind, channel, draft_body, edited_body, status, sent_at",
    )
    .eq("id", args.queue_id)
    .eq("organization_id", args.organization_id)
    .maybeSingle();
  if (rowErr || !rowData) return { ok: false, reason: "not_found" };

  const row = rowData as {
    id: string;
    organization_id: string;
    workspace_id: string | null;
    lead_id: string;
    agent_kind: string;
    channel: "whatsapp" | "email" | "sms";
    draft_body: string;
    edited_body: string | null;
    status: "pending" | "approved" | "rejected" | "sent";
    sent_at: string | null;
  };

  if (row.status === "sent") return { ok: true, already_sent: true };
  if (row.status !== "approved") {
    return { ok: false, reason: "not_approved" };
  }

  // Local helpers — close over client, args, row. `deferred` is the
  // "org hasn't configured this channel" path: approval succeeded, send is
  // deferred, row stays approved. `recordSendFailure` is the D-415 retry
  // contract: stamp send_error, leave the row approved for re-approval.
  const deferred = async (channel: string): Promise<DispatchResult> => {
    await client.from("audit_log").insert({
      actor_id: args.actor_id,
      actor_type: "user",
      actor_role: "org_admin",
      organization_id: row.organization_id,
      table_name: "agent_approval_queue",
      record_id: row.id,
      action: "agent_draft_send_deferred",
      diff: { channel, reason: "not_configured" },
    });
    return { ok: false, reason: "not_configured", message: channel };
  };

  const recordSendFailure = async (
    channel: string,
    provider: string,
    message: string,
  ): Promise<DispatchResult> => {
    await client
      .from("agent_approval_queue")
      .update({ send_error: message.slice(0, 500) })
      .eq("id", row.id)
      .eq("organization_id", row.organization_id);
    await client.from("audit_log").insert({
      actor_id: args.actor_id,
      actor_type: "user",
      actor_role: "org_admin",
      organization_id: row.organization_id,
      table_name: "agent_approval_queue",
      record_id: row.id,
      action: "agent_draft_send_failed",
      diff: { channel, provider, reason: message },
    });
    return { ok: false, reason: "provider_error", message };
  };

  // 2. Load the lead's recipient (phone / email) from nodes.data.
  const { data: leadData } = await client
    .from("nodes")
    .select("data, label, workspace_id, organization_id")
    .eq("id", row.lead_id)
    .eq("organization_id", args.organization_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .maybeSingle();
  if (!leadData) return { ok: false, reason: "missing_recipient" };
  const lead = leadData as {
    data: Record<string, unknown>;
    label: string;
    workspace_id: string;
    organization_id: string;
  };

  const body = (row.edited_body ?? row.draft_body).trim();

  // 3. Channel dispatch — resolve the org's live adapter, then send.
  let provider: string;
  let providerMessageId: string;
  if (row.channel === "email") {
    const to =
      (lead.data?.email as string | undefined) ??
      (lead.data?.contact_email as string | undefined);
    if (!to)
      return {
        ok: false,
        reason: "missing_recipient",
        message: "no email on lead",
      };
    const resolved = await resolveOrgAdapter(
      "email",
      row.organization_id,
      client,
    );
    if (!resolved.ok) {
      return resolved.reason === "not_configured"
        ? deferred("email")
        : recordSendFailure("email", "unresolved", resolved.message);
    }
    provider = resolved.provider;
    try {
      const r = await resolved.adapter.send({
        kind: "custom",
        organization_id: row.organization_id,
        to,
        subject: subjectForAgentKind(row.agent_kind),
        body_text: body,
      });
      providerMessageId = r.provider_message_id;
    } catch (err) {
      return recordSendFailure("email", provider, errToMessage(err));
    }
  } else if (row.channel === "sms") {
    const to =
      (lead.data?.phone as string | undefined) ??
      (lead.data?.contact_phone as string | undefined);
    if (!to)
      return {
        ok: false,
        reason: "missing_recipient",
        message: "no phone on lead",
      };
    const resolved = await resolveOrgAdapter(
      "sms",
      row.organization_id,
      client,
      FOLLOW_UP_DLT_TEMPLATE_IDS,
    );
    if (!resolved.ok) {
      return resolved.reason === "not_configured"
        ? deferred("sms")
        : recordSendFailure("sms", "unresolved", resolved.message);
    }
    provider = resolved.provider;
    try {
      const r = await resolved.adapter.send({
        kind: "templated",
        organization_id: row.organization_id,
        template_id: FOLLOW_UP_DLT_TEMPLATES[0]!.id,
        to_phone_e164: to,
        data: { name: deriveFirstName(lead.label), body },
      });
      providerMessageId = r.provider_message_id;
    } catch (err) {
      return recordSendFailure("sms", provider, errToMessage(err));
    }
  } else if (row.channel === "whatsapp") {
    const to =
      (lead.data?.phone as string | undefined) ??
      (lead.data?.contact_phone as string | undefined);
    if (!to)
      return {
        ok: false,
        reason: "missing_recipient",
        message: "no phone on lead",
      };
    const resolved = await resolveOrgAdapter(
      "whatsapp",
      row.organization_id,
      client,
    );
    if (!resolved.ok) {
      return resolved.reason === "not_configured"
        ? deferred("whatsapp")
        : recordSendFailure("whatsapp", "unresolved", resolved.message);
    }
    provider = resolved.provider;
    const tpl = FOLLOW_UP_WA_TEMPLATES[0]!;
    try {
      const r = await resolved.adapter.send({
        kind: "template",
        organization_id: row.organization_id,
        template_id: tpl.id,
        to_phone_e164: to,
        language_code: tpl.language_code,
        data: { name: deriveFirstName(lead.label), body },
      });
      providerMessageId = r.provider_message_id;
    } catch (err) {
      // template_not_found means the org has not approved the follow-up
      // template — a setup gap with the same operator remediation as
      // "not configured", so route it to the deferred UX, not a hard error.
      if (err instanceof CommsError && err.kind === "template_not_found") {
        return deferred("whatsapp");
      }
      return recordSendFailure("whatsapp", provider, errToMessage(err));
    }
  } else {
    // Unreachable — the three channels above exhaust row.channel. The
    // `never` binding turns a new channel into a compile error.
    const exhaustive: never = row.channel;
    return {
      ok: false,
      reason: "not_configured",
      message: String(exhaustive),
    };
  }

  // 4. Activity node + edge.
  const actIns = await client
    .from("nodes")
    .insert({
      organization_id: row.organization_id,
      workspace_id: lead.workspace_id,
      node_type: "activity",
      label: `Follow-up sent · ${row.channel}`,
      state: null,
      data: {
        kind: "comms_sent",
        channel: row.channel,
        provider,
        queue_id: row.id,
        provider_message_id: providerMessageId,
        agent_kind: row.agent_kind,
      },
      created_by: FOLLOW_UP_SERVICE_ACCOUNT,
      created_via: "system",
      updated_by: FOLLOW_UP_SERVICE_ACCOUNT,
      updated_via: "system",
    })
    .select("id")
    .single();
  const actErr = (actIns as { error: { message: string } | null }).error;
  if (actErr) {
    // Activity write failed — still report success for the send (message
    // went out) but surface the error so operator can investigate.
    return {
      ok: false,
      reason: "provider_error",
      message: `send succeeded but activity write failed: ${actErr.message}`,
    };
  }
  const activity_id = (actIns as { data: { id: string } }).data.id;

  await client.from("edges").insert({
    organization_id: row.organization_id,
    workspace_id: lead.workspace_id,
    from_node_id: activity_id,
    to_node_id: row.lead_id,
    edge_type: "describes",
    created_by: FOLLOW_UP_SERVICE_ACCOUNT,
    created_via: "system",
    updated_by: FOLLOW_UP_SERVICE_ACCOUNT,
    updated_via: "system",
  });

  // 5. Mark sent on the queue row.
  await client
    .from("agent_approval_queue")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider,
      provider_message_id: providerMessageId,
      send_error: null,
    })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id);

  // 6. Audit.
  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: row.organization_id,
    table_name: "agent_approval_queue",
    record_id: row.id,
    action: "agent_draft_sent",
    diff: {
      channel: row.channel,
      provider,
      activity_id,
      provider_message_id: providerMessageId,
    },
  });

  return {
    ok: true,
    status: "sent",
    provider,
    provider_message_id: providerMessageId,
    activity_id,
  };
}

function subjectForAgentKind(agent_kind: string): string {
  switch (agent_kind) {
    case "follow_up_stale_lead":
      return "Just checking in";
    default:
      return "Follow-up";
  }
}

function deriveFirstName(label: string): string {
  const trimmed = label.trim();
  const sp = trimmed.indexOf(" ");
  return sp > 0 ? trimmed.slice(0, sp) : trimmed || "there";
}
