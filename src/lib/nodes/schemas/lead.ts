import { z } from "zod";

export const LEAD_SOURCES = [
  "90sec",
  "magicbricks",
  "housing",
  "facebook",
  "walkin",
  "channel_partner",
  "mih",
  "other",
] as const;

export const leadSchema = z
  .object({
    phone: z.string().min(7),
    email: z.string().email().optional(),
    source: z.enum(LEAD_SOURCES),
    intent_score: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
    /**
     * v6.2.1 — Quick Action modal writes a follow-up reminder time. ISO 8601.
     * Optional; absence means no scheduled reminder.
     */
    follow_up_on: z.string().datetime().optional(),
    /**
     * D-610 — allocation engine writes the assigned sales rep here. Surfaced
     * by canApproveQueueItem to scope draft-approval to the lead's owner.
     */
    assigned_sales_rep_id: z.string().uuid().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type LeadData = z.infer<typeof leadSchema>;
export default leadSchema;
