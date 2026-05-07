import { z } from "zod";

export const propertySchema = z
  .object({
    name: z.string().min(1),
    city: z.string().min(1),
    rera_number: z.string().optional(),
    unit_count: z.number().int().nonnegative().optional(),
    address: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type PropertyData = z.infer<typeof propertySchema>;
export default propertySchema;
