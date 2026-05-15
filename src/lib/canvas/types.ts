import type { LeadData } from "@/lib/nodes/schemas/lead";

/** Five-tier agent classification per Constitution I. */
export type AgentTier = "T0" | "T1" | "T2" | "T3" | "T4";

export type CanvasLead = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  state: string;
  data: LeadData;
  created_at: string;
  updated_at: string;
};

export type CanvasActivity = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  data: Record<string, unknown>;
  created_at: string;
  created_by: string;
  created_via: string;
  ai_confidence: number | null;
  agent_tier: AgentTier | null;
};

export type CanvasData = {
  lead: CanvasLead;
  activities: CanvasActivity[];
};

/** v6.2.1 — per-tab badge counts surfaced on the split-pane canvas v2. */
export type CanvasTabCounts = {
  updates: number;
  ai_drafts: number;
  chats: number;
  calls: number;
  emails: number;
  comments: number;
  appointments: number;
  documents: number;
};

/** v6.2.1 — a queue row for the AI Drafts tab. Schema mirrors DraftCardItem. */
export type PendingDraft = {
  id: string;
  lead_id: string;
  agent_kind: string;
  channel: "whatsapp" | "email" | "sms";
  draft_body: string;
  created_at: string;
  attachments: Array<{
    brochure_id: string;
    title: string;
    document_type: string;
  }>;
  error: string | null;
};

export type CanvasDataV2 = CanvasData & {
  tab_counts: CanvasTabCounts;
  pending_drafts: PendingDraft[];
};
