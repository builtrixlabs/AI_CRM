import { z } from "zod";

export const WIDGET_TYPES = [
  "lead_count_by_state",
  "directive_fires_24h",
  "active_users_count",
  "recent_leads",
  "agent_status",
  // D-224 — real-estate booking pipeline
  "booking_pipeline",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_LABEL: Record<WidgetType, string> = {
  lead_count_by_state: "Lead count by state",
  directive_fires_24h: "Directive fires (24h)",
  active_users_count: "Active users count",
  recent_leads: "Recent leads",
  agent_status: "Agent status",
  booking_pipeline: "Booking pipeline",
};

export const WIDGET_DESCRIPTION: Record<WidgetType, string> = {
  lead_count_by_state: "KPI breakdown of leads by lifecycle state.",
  directive_fires_24h: "Total directive invocations in the last 24h.",
  active_users_count: "Currently active org members.",
  recent_leads: "Last 10 leads ordered by creation time.",
  agent_status: "Provisioned vs. suspended agent count.",
  booking_pipeline:
    "Real-estate funnel: qualified → site visit → negotiation → booked.",
};

export const widgetSpecSchema = z
  .object({
    type: z.enum(WIDGET_TYPES),
    title: z.string().max(120).optional(),
  })
  .strict();
export type WidgetSpec = z.infer<typeof widgetSpecSchema>;

export const dashboardLayoutSchema = z
  .object({
    widgets: z.array(widgetSpecSchema).max(20),
  })
  .strict();
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

export const createDashboardInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    layout: dashboardLayoutSchema,
  })
  .strict();
export type CreateDashboardInput = z.infer<typeof createDashboardInputSchema>;

export const updateLayoutInputSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    layout: dashboardLayoutSchema,
  })
  .strict();
export type UpdateLayoutInput = z.infer<typeof updateLayoutInputSchema>;

export const deleteDashboardInputSchema = z
  .object({ id: z.string().uuid() })
  .strict();
export type DeleteDashboardInput = z.infer<typeof deleteDashboardInputSchema>;

export type DashboardRow = {
  id: string;
  organization_id: string;
  name: string;
  layout: DashboardLayout;
  created_at: string;
  deleted_at: string | null;
};

export class DashboardError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_found" | "invalid",
  ) {
    super(message);
    this.name = "DashboardError";
  }
}
