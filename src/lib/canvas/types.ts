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
