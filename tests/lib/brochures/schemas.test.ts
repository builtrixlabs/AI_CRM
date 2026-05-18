import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  BUDGET_BANDS,
  DOCUMENT_TYPES,
  MAX_FILE_BYTES,
  brochureMetadataSchema,
  documentTypeSchema,
  isAllowedMimeType,
  parseMetadataLenient,
} from "@/lib/brochures/schemas";

describe("D-607 brochure metadata schema", () => {
  it("accepts a fully-specified metadata object", () => {
    const r = brochureMetadataSchema.safeParse({
      bhk: 3,
      budget_band: "1.5-2Cr",
      area_sqft_min: 1200,
      area_sqft_max: 1800,
      tags: ["lake-view", "corner-unit"],
      description: "East-facing 3BHK floor plan",
    });
    expect(r.success).toBe(true);
  });

  it("defaults tags to an empty array when omitted", () => {
    const r = brochureMetadataSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tags).toEqual([]);
  });

  it("rejects bhk outside 1–5", () => {
    expect(brochureMetadataSchema.safeParse({ bhk: 0 }).success).toBe(false);
    expect(brochureMetadataSchema.safeParse({ bhk: 6 }).success).toBe(false);
    expect(brochureMetadataSchema.safeParse({ bhk: 2.5 }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const r = brochureMetadataSchema.safeParse({ bhk: 3, sneaky: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects area_sqft_min greater than area_sqft_max", () => {
    const r = brochureMetadataSchema.safeParse({
      area_sqft_min: 2000,
      area_sqft_max: 1000,
    });
    expect(r.success).toBe(false);
  });

  it("accepts an MIH-style arbitrary budget_band string", () => {
    // budget_band is intentionally NOT a DB enum — D-604 MIH leads carry
    // free-form bands.
    const r = brochureMetadataSchema.safeParse({ budget_band: "90L-1.1Cr" });
    expect(r.success).toBe(true);
  });
});

describe("parseMetadataLenient", () => {
  it("returns the parsed value for valid input", () => {
    expect(parseMetadataLenient({ bhk: 4, tags: ["x"] })).toEqual({
      bhk: 4,
      tags: ["x"],
    });
  });

  it("falls back to { tags: [] } for garbage rather than throwing", () => {
    expect(parseMetadataLenient({ bhk: 99, junk: true })).toEqual({ tags: [] });
    expect(parseMetadataLenient(null)).toEqual({ tags: [] });
    expect(parseMetadataLenient("not an object")).toEqual({ tags: [] });
  });
});

describe("document type + mime constants", () => {
  it("documentTypeSchema accepts the five known types and rejects others", () => {
    for (const dt of DOCUMENT_TYPES) {
      expect(documentTypeSchema.safeParse(dt).success).toBe(true);
    }
    expect(documentTypeSchema.safeParse("contract").success).toBe(false);
  });

  it("isAllowedMimeType gates to PDF/JPEG/PNG", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("image/gif")).toBe(false);
    expect(isAllowedMimeType("application/zip")).toBe(false);
  });

  it("exposes the 25 MB cap and a non-empty budget-band suggestion list", () => {
    expect(MAX_FILE_BYTES).toBe(26_214_400);
    expect(ALLOWED_MIME_TYPES.length).toBe(3);
    expect(BUDGET_BANDS.length).toBeGreaterThan(0);
  });
});
