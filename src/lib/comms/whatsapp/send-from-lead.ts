// v6.2.2 — on-demand WhatsApp send from the lead workspace.
//
// Mirrors sendEmailFromLead but routed through the WhatsApp Business
// adapter. WABA only allows unsolicited sends via pre-approved templates,
// so the call shape is `{ template_id, variables }`. The org's approved
// template ids live in org_whatsapp_endpoints.approved_template_ids and
// are enforced at the adapter layer (D-432 fails-closed on unknown ids).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveOrgAdapter } from "@/lib/comms/resolve-org-adapter";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type SendWhatsAppFromLeadArgs = {
  organization_id: string;
  lead_id: string;
  from_user_id: string;
  template_id: string;
  variables: Record<string, string>;
  language_code?: string;
  /** Optional override — defaults to the lead's `data.phone`. */
  to_phone_override?: string;
};

export type SendWhatsAppFromLeadResult =
  | {
      ok: true;
      provider_message_id: string;
      template_id: string;
      activity_id: string;
      provider: string;
    }
  | {
      ok: false;
      reason:
        | "lead_not_found"
        | "no_lead_phone"
        | "missing_template"
        | "not_configured"
        | "provider_error";
      message?: string;
    };

export async function sendWhatsAppFromLead(
  args: SendWhatsAppFromLeadArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<SendWhatsAppFromLeadResult> {
  if (!UUID_RE.test(args.lead_id)) {
    return { ok: false, reason: "lead_not_found" };
  }
  if (!args.template_id.trim()) {
    return { ok: false, reason: "missing_template" };
  }

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
    (args.to_phone_override?.trim()
      ? args.to_phone_override.trim()
      : null) ?? pickPhone(lead.data);
  if (!toPhone) return { ok: false, reason: "no_lead_phone" };

  const resolved = await resolveOrgAdapter(
    "whatsapp",
    args.organization_id,
    client,
  );
  if (!resolved.ok) {
    return resolved.reason === "not_configured"
      ? { ok: false, reason: "not_configured" }
      : { ok: false, reason: "provider_error", message: resolved.message };
  }

  let provider_message_id: string;
  let usedTemplate: string;
  try {
    const r = await resolved.adapter.send({
      kind: "template",
      organization_id: args.organization_id,
      template_id: args.template_id.trim(),
      to_phone_e164: toPhone,
      ...(args.language_code ? { language_code: args.language_code } : {}),
      data: args.variables,
    });
    provider_message_id = r.provider_message_id;
    usedTemplate = r.template_id;
  } catch (err) {
    return {
      ok: false,
      reason: "provider_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const actIns = await client
    .from("nodes")
    .insert({
      organization_id: args.organization_id,
      workspace_id: lead.workspace_id,
      node_type: "activity",
      label: `WhatsApp sent: ${usedTemplate}`,
      state: null,
      data: {
        kind: "whatsapp",
        channel: "whatsapp",
        direction: "outbound",
        provider: resolved.provider,
        provider_message_id,
        template_id: usedTemplate,
        to_phone: toPhone,
        variables: args.variables,
        from_user_id: args.from_user_id,
        summary: `Outbound WhatsApp template '${usedTemplate}' via ${resolved.provider}`,
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
      message: `whatsapp sent but activity write failed: ${actErr.message}`,
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
    action: "whatsapp_sent",
    diff: {
      lead_id: lead.id,
      provider: resolved.provider,
      provider_message_id,
      template_id: usedTemplate,
      to: toPhone,
    },
  });

  return {
    ok: true,
    provider_message_id,
    template_id: usedTemplate,
    activity_id,
    provider: resolved.provider,
  };
}

/**
 * Fetch the org's approved WhatsApp template ids for the picker UI.
 * Returns [] when whatsapp isn't configured (the picker shows a hint
 * instead of failing the page).
 */
export async function listApprovedWhatsAppTemplates(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<string[]> {
  const { data } = await client
    .from("org_whatsapp_endpoints")
    .select("approved_template_ids, active")
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (!data) return [];
  const row = data as {
    approved_template_ids: string[] | null;
    active: boolean | null;
  };
  if (!row.active) return [];
  return Array.from(new Set(row.approved_template_ids ?? [])).filter((s) =>
    typeof s === "string" && s.trim().length > 0,
  );
}

function pickPhone(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const p =
    (data.phone as string | undefined) ??
    (data.contact_phone as string | undefined);
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

export const __testing = { pickPhone };
