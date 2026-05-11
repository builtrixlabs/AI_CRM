import { z } from "zod";

/**
 * D-420 — project node data shape.
 *
 * Project = the top of the RE inventory hierarchy (PRD v3.0 §3 P4).
 * Mirrors PRD's project-metadata field list. Strict — every key is named
 * so the schema doubles as documentation.
 */
export const projectSchema = z
  .object({
    name: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    address: z.string().max(500).nullable().optional(),
    rera_number: z.string().max(100).nullable().optional(),
    possession_date_committed: z.string().max(40).nullable().optional(),
    possession_date_revised: z.string().max(40).nullable().optional(),
    oc_status: z
      .enum(["not_applied", "applied", "received", "na"])
      .nullable()
      .optional(),
    cc_status: z
      .enum(["not_applied", "applied", "received", "na"])
      .nullable()
      .optional(),
    brochure_url: z.string().url().max(2000).nullable().optional(),
    layout_url: z.string().url().max(2000).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ProjectData = z.infer<typeof projectSchema>;
export default projectSchema;
