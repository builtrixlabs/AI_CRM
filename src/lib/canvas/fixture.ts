import type { CanvasActivity, CanvasLead } from "./types";

const ORG = "00000000-0000-4000-8000-000000000001";
const WS = "00000000-0000-4000-8000-000000000002";
const LEAD_ID = "00000000-0000-4000-8000-00000000beef";

const USER_RAKESH = "00000000-0000-4000-8000-000000000010";
const AGENT_ENRICHMENT = "00000000-0000-4000-8000-0000000000a1";

/** Demo lead — Priya Sharma · 3 BHK · Bangalore (PRD §6.1). No DB row. */
export const DEMO_LEAD: CanvasLead = {
  id: LEAD_ID,
  organization_id: ORG,
  workspace_id: WS,
  label: "Priya Sharma",
  state: "qualified",
  data: {
    phone: "+91-9876543210",
    email: "priya.sharma@example.com",
    source: "magicbricks",
    intent_score: 87,
    notes: "3 BHK · Bangalore · ₹1.8 Cr ± 10%",
  },
  created_at: "2026-04-30T08:00:00Z",
  updated_at: "2026-05-04T11:42:00Z",
};

/** Three demo activities — one human, one inbound, one AI-author. */
export const DEMO_ACTIVITIES: CanvasActivity[] = [
  {
    id: "00000000-0000-4000-8000-0000000a1001",
    organization_id: ORG,
    workspace_id: WS,
    label: "Call from Rakesh Kumar (12 min)",
    data: {
      kind: "call_audited",
      duration_seconds: 720,
      summary:
        "Discussed financing; loan pre-approval ready. Site visit requested for Saturday.",
    },
    created_at: "2026-05-04T09:42:00Z",
    created_by: USER_RAKESH,
    created_via: "call_audit",
    ai_confidence: null,
    agent_tier: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000a1002",
    organization_id: ORG,
    workspace_id: WS,
    label: "WhatsApp inbound",
    data: {
      kind: "whatsapp_inbound",
      text: "Hi, what's the floor plan for the 3BHK in Whitefield?",
    },
    created_at: "2026-05-03T19:11:00Z",
    created_by: USER_RAKESH,
    created_via: "whatsapp",
    ai_confidence: null,
    agent_tier: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000a1003",
    organization_id: ORG,
    workspace_id: WS,
    label: "Lead enriched · source 99acres",
    data: {
      kind: "ai_extraction",
      summary: "Resolved lead source + intent score from inbound payload.",
    },
    created_at: "2026-05-01T13:05:00Z",
    created_by: AGENT_ENRICHMENT,
    created_via: "ai_extraction",
    ai_confidence: 0.92,
    agent_tier: "T1",
  },
];
