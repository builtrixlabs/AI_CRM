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
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type LeadData = z.infer<typeof leadSchema>;
export default leadSchema;
