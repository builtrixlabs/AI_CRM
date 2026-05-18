import { z } from "zod";

/**
 * D-420 — tower node data shape.
 *
 * Tower = mid-tier of the RE inventory hierarchy (PRD v3.0 §3 P4).
 * Links to a project via `project_id`.
 */
export const towerSchema = z
  .object({
    project_id: z.string().uuid(),
    name: z.string().min(1).max(120),
    total_floors: z.number().int().min(0).max(300).nullable().optional(),
    units_per_floor: z.number().int().min(0).max(60).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type TowerData = z.infer<typeof towerSchema>;
export default towerSchema;
