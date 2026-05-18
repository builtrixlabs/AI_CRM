// v6.2.2 — on-demand email send from the lead workspace.
//
// Mirrors the D-609 click-to-call orchestrator (src/lib/comms/telephony/
// click-to-call.ts): resolve the lead org-scoped → resolve the org's email
// adapter → send → write an `email.sent` activity node + audit row so the
// activity stream + Command Center pulse pick it up automatically.
//
// Manual sends bypass the agent_approval_queue (the rep is the human in
// the loop); the agent-drafted path (D-415) still routes through approval.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveOrgAdapter } from "@/lib/comms/resolve-org-adapter";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type SendEmailFromLeadArgs = {
  organization_id: string;
  lead_id: string;
  from_user_id: string;
  subject: string;
  body_text: string;
  body_html?: string;
  /** Optional override — defaults to the lead's `data.email`. */
  to_override?: string;
};

export type SendEmailFromLeadResult =
  | {
      ok: true;
      provider_message_id: string;
      thread_id: string;
      activity_id: string;
      provider: string;
    }
  | {
      ok: false;
      reason:
        | "lead_not_found"
        | "no_lead_email"
        | "missing_subject"
        | "missing_body"
        | "not_configured"
        | "provider_error";
      message?: string;
    };

export async function sendEmailFromLead(
  args: SendEmailFromLeadArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<SendEmailFromLeadResult> {
  if (!UUID_RE.test(args.lead_id)) {
    return { ok: false, reason: "lead_not_found" };
  }
  if (!args.subject.trim()) return { ok: false, reason: "missing_subject" };
  if (!args.body_text.trim()) return { ok: false, reason: "missing_body" };

  // 1. Resolve the lead — org-scoped.
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
  const toEmail =
    (args.to_override?.trim() ? args.to_override.trim() : null) ??
    pickEmail(lead.data);
  if (!toEmail) return { ok: false, reason: "no_lead_email" };

  // 2. Resolve the org's email adapter.
  const resolved = await resolveOrgAdapter("email", args.organization_id, client);
  if (!resolved.ok) {
    return resolved.reason === "not_configured"
      ? { ok: false, reason: "not_configured" }
      : { ok: false, reason: "provider_error", message: resolved.message };
  }

  // 3. Send.
  let provider_message_id: string;
  let thread_id: string;
  try {
    const r = await resolved.adapter.send({
      kind: "custom",
      organization_id: args.organization_id,
      to: toEmail,
      subject: args.subject.trim(),
      body_text: args.body_text.trim(),
      ...(args.body_html ? { body_html: args.body_html } : {}),
    });
    provider_message_id = r.provider_message_id;
    thread_id = r.thread_id;
  } catch (err) {
    return {
      ok: false,
      reason: "provider_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. Activity node + edge + audit. Matches the D-609 click-to-call shape.
  const actIns = await client
    .from("nodes")
    .insert({
      organization_id: args.organization_id,
      workspace_id: lead.workspace_id,
      node_type: "activity",
      label: `Email sent: ${args.subject.trim().slice(0, 80)}`,
      state: null,
      data: {
        kind: "email",
        channel: "email",
        direction: "outbound",
        provider: resolved.provider,
        provider_message_id,
        thread_id,
        to: toEmail,
        subject: args.subject.trim(),
        body_preview: args.body_text.trim().slice(0, 240),
        from_user_id: args.from_user_id,
        summary: `Outbound email via ${resolved.provider}`,
      },
      created_by: args.from_user_id,
      created_via: "manual_send",
      updated_by: args.from_user_id,
      updated_via: "manual_send",
    })
    .select("id")
    .single();
  const actErr = (actIns as { error: { message: string } | null }).error;
  if (actErr) {
    return {
      ok: false,
      reason: "provider_error",
      message: `email sent but activity write failed: ${actErr.message}`,
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
    created_via: "manual_send",
    updated_by: args.from_user_id,
    updated_via: "manual_send",
  });

  await client.from("audit_log").insert({
    actor_id: args.from_user_id,
    actor_type: "user",
    actor_role: "lead_comms",
    organization_id: args.organization_id,
    workspace_id: lead.workspace_id,
    table_name: "nodes",
    record_id: activity_id,
    action: "email_sent",
    diff: {
      lead_id: lead.id,
      provider: resolved.provider,
      provider_message_id,
      to: toEmail,
    },
  });

  return {
    ok: true,
    provider_message_id,
    thread_id,
    activity_id,
    provider: resolved.provider,
  };
}

function pickEmail(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const e =
    (data.email as string | undefined) ??
    (data.contact_email as string | undefined);
  return typeof e === "string" && e.trim() ? e.trim() : null;
}

// Re-export for tests.
export const __testing = { pickEmail };
