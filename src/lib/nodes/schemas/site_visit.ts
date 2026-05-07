import { z } from "zod";

export const siteVisitSchema = z
  .object({
    lead_id: z.string().uuid(),
    deal_id: z.string().uuid().optional(),
    property_id: z.string().uuid().optional(),
    scheduled_at: z.string().datetime(),
    coordinator_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type SiteVisitData = z.infer<typeof siteVisitSchema>;
export default siteVisitSchema;
