import type { AgentTier } from "@/lib/ai/types";

export type TriggerKind =
  | "lead.created"
  | "lead.state_changed"
  | "lead.idle_threshold"
  | "lead.intent_crossed"
  | "lead.preference_matched"
  | "site_visit.window"
  | "site_visit.state_changed"
  | "deal.state_changed"
  | "cp.lead_submitted"
  | "mih.lead_pushed"
  | "legal.flag_raised"
  | "call.objection_detected";

export type ActionKind =
  | "enqueue_agent"
  | "surface_on_canvas"
  | "flag_lead"
  | "send_template_message"
  | "notify_user"
  | "attach_node";

export type Outcome =
  | "dispatched"
  | "skipped_condition"
  | "skipped_disabled"
  | "skipped_idempotent"
  | "rate_limited"
  | "failed_tier_ceiling"
  | "pending_approval"
  | "error";

export type DirectiveRow = {
  id: string;
  organization_id: string | null;
  code: string;
  display_name: string;
  trigger_kind: TriggerKind;
  trigger_config: Record<string, unknown>;
  action_kind: ActionKind;
  action_config: Record<string, unknown>;
  tier: AgentTier;
  enabled: boolean;
};

export type Trigger = {
  kind: TriggerKind;
  /** Stable id used for idempotency; e.g. lead_id + state for state_changed. */
  trigger_id: string;
  organization_id: string;
  workspace_id: string | null;
  subject_node_id: string | null;
  /** Free-form payload — event adapter decides shape. */
  payload: Record<string, unknown>;
};

export type DispatchResult = {
  directive_id: string;
  code: string;
  outcome: Outcome;
  details?: Record<string, unknown>;
};
