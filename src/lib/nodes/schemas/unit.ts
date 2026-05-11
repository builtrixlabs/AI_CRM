import { z } from "zod";

/**
 * Unit node data shape.
 *
 * Originally authored in D-320 (4-state availability: available/held/booked/
 * sold; required `property_id` + `bhk` + `price`). D-420 widens it to the
 * PRD v3.0 §3 P4 metadata superset (project_id, tower_id, unit_type, carpet/
 * builtup/saleable, facing, view, PLC, parking, RERA, etc.) while keeping
 * the legacy fields valid so existing D-320 catalog rows continue to round-trip.
 *
 * Backward-compat invariant: at least one of `project_id` or `property_id`
 * must be present (refine below). All other PRD §3 P4 fields are optional —
 * partial catalogs are valid (a builder may load skeleton inventory first and
 * fill in PLC / parking / RERA later).
 */
export const unitSchema = z
  .object({
    // Hierarchy linkage — either legacy (property_id) or new (project_id +
    // optional tower_id). Refine asserts at least one is present.
    property_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    tower_id: z.string().uuid().nullable().optional(),

    unit_no: z.string().min(1).max(40),
    floor: z.number().int().min(-5).max(300).nullable().optional(),

    // Legacy D-320 fields (kept for catalog round-trip). bhk bounds preserved
    // from the original D-002 schema; plot / commercial / villa units omit it
    // entirely (use `unit_type` instead).
    bhk: z.number().int().min(1).max(10).optional(),
    price: z.number().nonnegative().max(10_000_000_000).optional(),

    // D-420 metadata (PRD §3 P4).
    unit_type: z
      .enum([
        "studio",
        "1bhk",
        "2bhk",
        "2.5bhk",
        "3bhk",
        "3.5bhk",
        "4bhk",
        "5bhk",
        "penthouse",
        "villa",
        "plot",
        "commercial",
        "other",
      ])
      .optional(),
    carpet_area_sqft: z.number().min(0).max(100_000).nullable().optional(),
    builtup_area_sqft: z.number().min(0).max(100_000).nullable().optional(),
    saleable_area_sqft: z.number().min(0).max(100_000).nullable().optional(),
    facing: z
      .enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"])
      .nullable()
      .optional(),
    view: z.string().max(120).nullable().optional(),
    corner_or_mid: z.enum(["corner", "mid", "end"]).nullable().optional(),
    floor_rise_factor: z.number().min(0).max(100).nullable().optional(),
    base_price: z.number().min(0).max(10_000_000_000).nullable().optional(),
    price_per_sqft: z.number().min(0).max(1_000_000).nullable().optional(),
    plc: z.number().min(0).max(10_000_000_000).nullable().optional(),
    parking_count: z.number().int().min(0).max(20).nullable().optional(),
    rera_unit_id: z.string().max(120).nullable().optional(),

    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((d) => Boolean(d.project_id || d.property_id), {
    message: "unit requires project_id (D-420) or property_id (D-320 legacy)",
    path: ["project_id"],
  });

export type UnitData = z.infer<typeof unitSchema>;
export default unitSchema;
