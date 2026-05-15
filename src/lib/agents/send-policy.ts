// D-614 (V6 Phase 2) — Predefined Message Templates: the per-org send
// policy that every AI agent consults before deciding to dispatch its
// draft immediately or queue it for operator approval.
//
// resolveSendPolicy was a stub inside brochure-agent.ts (D-600 left the
// seam). It lives here now because the follow-up agent needs it too — a
// follow-up agent importing from brochure-agent.ts would be a wrong-way
// dependency. brochure-agent.ts re-exports it for any pre-existing import.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AgentMessagePolicy = "auto_send" | "require_approval";

/** The policy for any (org, agent_kind) without an explicit row (PRD AC-2). */
export const DEFAULT_SEND_POLICY: AgentMessagePolicy = "require_approval";

/**
 * Agent kinds whose send policy an org admin may configure at
 * /admin/agents/policies. A new agent kind opts in by joining this list.
 */
export const POLICY_CONFIGURABLE_AGENT_KINDS = [
  "brochure_send",
  "follow_up_stale_lead",
] as const;
export type ConfigurableAgentKind =
  (typeof POLICY_CONFIGURABLE_AGENT_KINDS)[number];

/**
 * Agent kinds that ALWAYS require approval — they structurally cannot
 * auto-send. site_visit_booking produces a draft booking that needs
 * operator-entered cab details (driver / vehicle / pickup) before any
 * message exists to send. resolveSendPolicy hard-returns require_approval
 * for these regardless of any stored row (belt-and-suspenders — the
 * policies UI also never lets one be set).
 */
export const LOCKED_AGENT_KINDS = ["site_visit_booking"] as const;

export function isLockedAgentKind(agent_kind: string): boolean {
  return (LOCKED_AGENT_KINDS as readonly string[]).includes(agent_kind);
}

export function isConfigurableAgentKind(
  agent_kind: string,
): agent_kind is ConfigurableAgentKind {
  return (POLICY_CONFIGURABLE_AGENT_KINDS as readonly string[]).includes(
    agent_kind,
  );
}

/** Display copy for the /admin/agents/policies surface. */
export const AGENT_KIND_LABELS: Record<
  string,
  { label: string; description: string }
> = {
  brochure_send: {
    label: "Brochure share",
    description:
      "After a call, the agent matches a brochure and drafts a WhatsApp message to share it. Low-risk, high-volume.",
  },
  follow_up_stale_lead: {
    label: "Stale-lead follow-up",
    description:
      "Every 6 hours the agent drafts a check-in message for leads with no recent contact.",
  },
  site_visit_booking: {
    label: "Site-visit booking",
    description:
      "Cab details (driver, vehicle, pickup) must be entered by an operator — this agent always requires approval.",
  },
};

/**
 * Resolve the send policy for an (org, agent_kind) pair. Returns the stored
 * mode, or DEFAULT_SEND_POLICY ('require_approval') when no row exists —
 * including when the table itself is absent (graceful degradation: an
 * agent run on a DB that predates this migration still queues for
 * approval, never throws). Locked agent kinds always return
 * 'require_approval'.
 *
 * Org-scoped: filters by organization_id on the service-role client.
 */
export async function resolveSendPolicy(
  organization_id: string,
  agent_kind: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AgentMessagePolicy> {
  if (isLockedAgentKind(agent_kind)) return "require_approval";

  const { data, error } = await client
    .from("agent_message_policies")
    .select("mode")
    .eq("organization_id", organization_id)
    .eq("agent_kind", agent_kind)
    .maybeSingle();

  if (error || !data) return DEFAULT_SEND_POLICY;
  return (data as { mode: string }).mode === "auto_send"
    ? "auto_send"
    : "require_approval";
}
