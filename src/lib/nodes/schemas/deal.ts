import { z } from "zod";

export const dealSchema = z
  .object({
    lead_id: z.string().uuid(),
    expected_value: z.number().nonnegative(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/)
      .default("INR"),
    pricing_sheet: z.string().url().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type DealData = z.infer<typeof dealSchema>;
export default dealSchema;
