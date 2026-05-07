import { z } from "zod";

export const unitSchema = z
  .object({
    property_id: z.string().uuid(),
    unit_no: z.string().min(1),
    bhk: z.number().int().min(1).max(10),
    floor: z.number().int().optional(),
    price: z.number().nonnegative(),
    carpet_area_sqft: z.number().positive().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type UnitData = z.infer<typeof unitSchema>;
export default unitSchema;
