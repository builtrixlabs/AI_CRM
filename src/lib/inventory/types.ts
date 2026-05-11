/**
 * D-420 — Zod schemas + TS types for project / tower / unit payloads.
 *
 * Schemas live in this module rather than per-api so they can be reused by
 * the CSV bulk-import (D-124) when it lands.
 */
import { z } from "zod";
import { INVENTORY_STATES } from "./transitions";

// ── Project ─────────────────────────────────────────────────────────────────

export const projectCreateSchema = z
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
  })
  .strict();

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const projectPatchSchema = projectCreateSchema.partial();
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

// ── Tower ───────────────────────────────────────────────────────────────────

export const towerCreateSchema = z
  .object({
    project_id: z.string().uuid(),
    name: z.string().min(1).max(120),
    total_floors: z.number().int().min(0).max(300).nullable().optional(),
    units_per_floor: z.number().int().min(0).max(60).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type TowerCreateInput = z.infer<typeof towerCreateSchema>;

export const towerPatchSchema = towerCreateSchema.partial().omit({ project_id: true });
export type TowerPatch = z.infer<typeof towerPatchSchema>;

// ── Unit ────────────────────────────────────────────────────────────────────

export const UNIT_TYPES = [
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
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

export const unitCreateSchema = z
  .object({
    project_id: z.string().uuid(),
    tower_id: z.string().uuid().nullable().optional(),
    unit_no: z.string().min(1).max(40),
    floor: z.number().int().min(-5).max(300).nullable().optional(),
    unit_type: z.enum(UNIT_TYPES),
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
    base_price: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
    price_per_sqft: z.number().min(0).max(1_000_000).nullable().optional(),
    plc: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
    parking_count: z.number().int().min(0).max(20).nullable().optional(),
    rera_unit_id: z.string().max(120).nullable().optional(),
    initial_state: z.enum(INVENTORY_STATES).optional(),
  })
  .strict();

export type UnitCreateInput = z.infer<typeof unitCreateSchema>;

export const unitPatchSchema = unitCreateSchema
  .partial()
  .omit({ project_id: true, tower_id: true, initial_state: true });
export type UnitPatch = z.infer<typeof unitPatchSchema>;

// ── Row shapes returned by lib readers ──────────────────────────────────────

export type ProjectRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  city: string;
  address: string | null;
  rera_number: string | null;
  possession_date_committed: string | null;
  possession_date_revised: string | null;
  oc_status: string | null;
  cc_status: string | null;
  brochure_url: string | null;
  layout_url: string | null;
  notes: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
};

export type TowerRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  total_floors: number | null;
  units_per_floor: number | null;
  notes: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
};

export type UnitRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string;
  tower_id: string | null;
  unit_no: string;
  floor: number | null;
  unit_type: UnitType;
  carpet_area_sqft: number | null;
  builtup_area_sqft: number | null;
  saleable_area_sqft: number | null;
  facing: string | null;
  view: string | null;
  corner_or_mid: string | null;
  floor_rise_factor: number | null;
  base_price: number | null;
  price_per_sqft: number | null;
  plc: number | null;
  parking_count: number | null;
  rera_unit_id: string | null;
  state: string;
  state_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ByStateCounts = Record<(typeof INVENTORY_STATES)[number], number>;

export function emptyByStateCounts(): ByStateCounts {
  return {
    available: 0,
    held: 0,
    blocked: 0,
    booked: 0,
    sold: 0,
    registered: 0,
    possessed: 0,
  };
}
