import { z } from "zod";

export const siteVisitSchema = z
  .object({
    lead_id: z.string().uuid(),
    deal_id: z.string().uuid().optional(),
    property_id: z.string().uuid().optional(),
    scheduled_at: z.string().datetime(),
    coordinator_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    // D-602 (V6 Phase 1) — site-visit module fields. project_id +
    // assigned_sales_rep_id power the list filters + role-scoping; the
    // cab_*/driver_*/pickup_* block is written by D-601 (Phase 2) and
    // rendered read-only by the D-602 detail page.
    project_id: z.string().uuid().optional(),
    assigned_sales_rep_id: z.string().uuid().optional(),
    cab_provider: z.string().optional(),
    cab_booking_ref: z.string().optional(),
    driver_name: z.string().optional(),
    driver_phone: z.string().optional(),
    vehicle_number: z.string().optional(),
    pickup_address: z.string().optional(),
    pickup_time: z.string().datetime().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type SiteVisitData = z.infer<typeof siteVisitSchema>;
export default siteVisitSchema;
