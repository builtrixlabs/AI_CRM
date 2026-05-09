/**
 * Admin / onboarding types. The wizard step IDs ratify into a literal union
 * here — adding or reordering is a contract change reviewed in Plan Mode.
 */

export const STEP_IDS = [
  "org_details",       // 1 — hard gate
  "branding",          // 2
  "first_workspace",   // 3 — hard gate
  "lead_sources",      // 4
  "pipeline_stages",   // 5
  "team_users",        // 6
  "integrations",      // 7
  "sample_demo",       // 8
] as const;

export type StepId = (typeof STEP_IDS)[number];

export const HARD_GATED_STEPS: ReadonlySet<StepId> = new Set([
  "org_details",
  "first_workspace",
]);

export const DEFAULT_PIPELINE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "site_visit_scheduled",
  "site_visit_done",
  "negotiation",
  "booked",
] as const;

export type OnboardingState = {
  completed: boolean;
  current_step: StepId | "completed";
  completed_steps: StepId[];
  lead_sources: string[];
  pipeline_stages: string[];
  integrations: {
    email: string | null;
    whatsapp: string | null;
    telephony: string | null;
  };
};

export type CockpitData = {
  subscription: { plan_tier: string; status: string } | null;
  usage: {
    active_users: number;
    workspaces: number;
    leads_30d: number;
  };
  open_tickets: number;
  onboarding: { completed: boolean; current_step: StepId | "completed" };
  compliance: {
    rera_number: string | null;
    gstin: string | null;
  };
};
