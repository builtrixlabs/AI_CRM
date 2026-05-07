import { z } from "zod";

export const callSchema = z
  .object({
    lead_id: z.string().uuid().optional(),
    deal_id: z.string().uuid().optional(),
    direction: z.enum(["inbound", "outbound"]),
    duration_seconds: z.number().int().nonnegative(),
    recording_url: z.string().url().optional(),
    summary: z.string().optional(),
    objection_detected: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CallData = z.infer<typeof callSchema>;
export default callSchema;
