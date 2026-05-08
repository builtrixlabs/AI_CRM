import { createNode } from "@/lib/nodes/api";
import { findAgent } from "./registry";
import { registerAgentHandler, type AgentHandler } from "./runtime";
import type { AgentInvocation, AgentResult } from "./types";
import type { AgentTier } from "@/lib/ai/types";

export const SEND_REMINDER_ACTION = "send_reminder";

export type SendReminderPayload = {
  visit_id: string;
  hours_until: number;
  /** 'T-12' for 24h reminder, 'T-13' for 2h. */
  template_id: string;
};

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const SYSTEM_PROMPT = `You are the Site Visit Reminder Agent (T2). You only send templated comms.
Output exactly the templated message body, with the visit's date/time substituted.
No personalization beyond date/time. No PII echoing.`;

function templateBody(template_id: string, scheduled_at: string): string {
  if (template_id === "T-12") {
    return `Hi! Just confirming your site visit on ${scheduled_at}. Reply YES to confirm.`;
  }
  if (template_id === "T-13") {
    return `Your site visit is in 2 hours (${scheduled_at}). Map + parking directions: <link>. See you soon!`;
  }
  return `Reminder: site visit at ${scheduled_at}.`;
}

const handler: AgentHandler = async (inv, deps) => {
  const payload = inv.payload as SendReminderPayload;
  if (!payload || typeof payload.visit_id !== "string") {
    return {
      ok: false,
      error: "validation",
      message: "send_reminder payload requires visit_id",
    };
  }
  const client = deps.client;
  if (!client) {
    return {
      ok: false,
      error: "validation",
      message: "no client provided",
    };
  }

  // Read the visit + the lead.
  const { data: visitRow, error: vErr } = await client
    .from("nodes")
    .select("id, label, state, data, organization_id, workspace_id")
    .eq("id", payload.visit_id)
    .eq("node_type", "site_visit")
    .eq("organization_id", inv.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (vErr) {
    return { ok: false, error: "unknown", message: vErr.message };
  }
  if (!visitRow) {
    return {
      ok: false,
      error: "validation",
      message: `visit ${payload.visit_id} not found in org ${inv.organization_id}`,
    };
  }
  const visitData = (visitRow.data ?? {}) as Record<string, unknown>;
  const scheduled_at =
    typeof visitData.scheduled_at === "string"
      ? (visitData.scheduled_at as string)
      : "<unknown>";
  const lead_id =
    typeof visitData.lead_id === "string" ? (visitData.lead_id as string) : null;

  if (!lead_id) {
    return {
      ok: false,
      error: "validation",
      message: "visit has no lead_id",
    };
  }

  // Templated body — no gateway call needed for V0 templates.
  const body = templateBody(payload.template_id, scheduled_at);
  const summary = `Reminder · ${payload.template_id} · ${scheduled_at}`;

  const created = await createNode(
    {
      organization_id: inv.organization_id,
      workspace_id: inv.workspace_id,
      node_type: "activity",
      label: summary,
      data: {
        subject_node_id: lead_id,
        kind: "whatsapp",
        summary,
        body,
        custom: {
          template_id: payload.template_id,
          visit_id: payload.visit_id,
          hours_until: payload.hours_until,
        },
      },
      created_by: inv.agent_id,
      created_via: "system",
    },
    client
  );

  // Edge: activity --mentioned_in--> lead
  await client.from("edges").insert({
    organization_id: inv.organization_id,
    workspace_id: inv.workspace_id,
    from_node_id: created.id,
    to_node_id: lead_id,
    edge_type: "mentioned_in",
    created_by: inv.agent_id,
    created_via: "system",
    updated_by: inv.agent_id,
    updated_via: "system",
  });

  // Audit row — agent action, T2.
  const auditRes = await client
    .from("audit_log")
    .insert({
      actor_id: inv.agent_id,
      actor_type: "agent",
      actor_role: "service_account",
      organization_id: inv.organization_id,
      workspace_id: inv.workspace_id,
      table_name: "nodes",
      record_id: created.id,
      action: "agent_action",
      agent_tier: inv.attempted_tier,
      prompt_version: findAgent("site_visit_reminder")?.prompt_version ?? "v1",
      reasoning: `Sent ${payload.template_id} reminder for visit ${payload.visit_id}`,
      compiled_artifact: {
        template_id: payload.template_id,
        hours_until: payload.hours_until,
        visit_id: payload.visit_id,
      },
    })
    .select("id")
    .single();
  const audit_log_id =
    !auditRes.error && auditRes.data
      ? (auditRes.data as { id: string }).id
      : null;

  // Avoid unused-var lint on SYSTEM_UUID/SYSTEM_PROMPT in V0 templated path.
  void SYSTEM_UUID;
  void SYSTEM_PROMPT;

  return {
    ok: true,
    tier: inv.attempted_tier,
    audit_log_id,
    output: { activity_id: created.id, template_id: payload.template_id },
  };
};

export const sendReminderHandler: AgentHandler = handler;

registerAgentHandler("site_visit_reminder", SEND_REMINDER_ACTION, handler);

export async function sendReminder(args: {
  agent_id: string;
  organization_id: string;
  workspace_id: string;
  visit_id: string;
  hours_until: number;
  template_id: string;
  attempted_tier?: AgentTier;
}, deps: import("./runtime").AgentDeps): Promise<AgentResult> {
  const { runAgent } = await import("./runtime");
  const inv: AgentInvocation = {
    agent_id: args.agent_id,
    organization_id: args.organization_id,
    workspace_id: args.workspace_id,
    action: SEND_REMINDER_ACTION,
    attempted_tier: args.attempted_tier ?? "T2",
    payload: {
      visit_id: args.visit_id,
      hours_until: args.hours_until,
      template_id: args.template_id,
    } satisfies SendReminderPayload,
  };
  return runAgent(inv, deps);
}
