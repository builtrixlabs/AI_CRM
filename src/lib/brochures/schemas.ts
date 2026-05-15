// D-607 (V6 Phase 2) — Brochure Repository schemas + constants.
//
// `document_type` is a CHECK-constrained column (the Brochure Agent
// hard-filters on it); the rest of the metadata is a typed JSONB shape
// validated on every write. Mirrors the Zod-in-JSONB pattern of
// src/lib/nodes/schemas/site_visit.ts.

import { z } from "zod";

/**
 * Brochure document categories. Mirrors the CHECK constraint in
 * supabase/migrations/20260514170000_brochures.sql — keep in sync.
 */
export const DOCUMENT_TYPES = [
  "brochure",
  "floor_plan",
  "price_sheet",
  "legal_doc",
  "amenity_doc",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

/**
 * Suggested budget bands the upload UI offers as a <select>. NOT a DB
 * enum — `brochureMetadataSchema` accepts any non-empty string so
 * MIH-sourced values (D-604) still validate; D-600's matcher normalizes
 * before comparing.
 */
export const BUDGET_BANDS = [
  "<50L",
  "50L-1Cr",
  "1-1.5Cr",
  "1.5-2Cr",
  "2-3Cr",
  "3-5Cr",
  "5Cr+",
] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

/** 25 MB — mirrors scripts/ensure_brochures_bucket.mjs and the bucket cap. */
export const MAX_FILE_BYTES = 26_214_400;

/** Mirrors the bucket's allowedMimeTypes (PDF / JPG / PNG). */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(m: string): m is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(m);
}

/** The private Supabase Storage bucket holding brochure files. Lives here
 *  (not in repository.ts) so client components can import it without
 *  pulling in the server-only admin client. */
export const BROCHURES_BUCKET = "brochures";

/**
 * The metadata shape the upload/edit server actions accept. A loose,
 * client-safe mirror of `brochureMetadataSchema`'s input — the repository
 * re-validates with the strict schema before persisting.
 */
export type BrochureMetadataInput = {
  bhk?: number;
  budget_band?: string;
  area_sqft_min?: number;
  area_sqft_max?: number;
  tags?: string[];
  description?: string;
};

/**
 * The `brochures.metadata` jsonb shape. `.strict()` — unknown keys are
 * rejected. Every create/update validates against this.
 */
export const brochureMetadataSchema = z
  .object({
    bhk: z.number().int().min(1).max(5).optional(),
    budget_band: z.string().min(1).max(40).optional(),
    area_sqft_min: z.number().positive().optional(),
    area_sqft_max: z.number().positive().optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).default([]),
    description: z.string().max(2000).optional(),
  })
  .strict()
  .refine(
    (m) =>
      m.area_sqft_min === undefined ||
      m.area_sqft_max === undefined ||
      m.area_sqft_min <= m.area_sqft_max,
    {
      message: "area_sqft_min must be <= area_sqft_max",
      path: ["area_sqft_min"],
    },
  );

export type BrochureMetadata = z.infer<typeof brochureMetadataSchema>;

/**
 * Lenient parse for reads — a row written before a schema tightening (or
 * by a future migration) should still render. Falls back to an empty
 * `{ tags: [] }` rather than throwing inside a list query.
 */
export function parseMetadataLenient(raw: unknown): BrochureMetadata {
  const parsed = brochureMetadataSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { tags: [] };
}
