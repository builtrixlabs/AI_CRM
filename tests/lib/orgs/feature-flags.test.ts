import { describe, expect, it } from "vitest";
import {
  getFeatureFlag,
  getFeatureFlags,
} from "@/lib/orgs/feature-flags";
import type { SupabaseClient } from "@supabase/supabase-js";

function stubClient(row: { feature_flags: unknown } | null, errored = false) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () =>
      errored
        ? { data: null, error: { message: "boom" } }
        : { data: row, error: null },
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("getFeatureFlag", () => {
  it("returns true when the flag is set to true", async () => {
    const client = stubClient({ feature_flags: { lead_canvas_v2: true } });
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(true);
  });

  it("returns false when the flag is set to false", async () => {
    const client = stubClient({ feature_flags: { lead_canvas_v2: false } });
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(false);
  });

  it("returns false when the flag key is missing", async () => {
    const client = stubClient({ feature_flags: { other_flag: true } });
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(false);
  });

  it("returns false when the bag is empty", async () => {
    const client = stubClient({ feature_flags: {} });
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(false);
  });

  it("returns false when the bag is null", async () => {
    const client = stubClient({ feature_flags: null });
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(false);
  });

  it("returns false when org_id is null (no current user / no org)", async () => {
    // null org short-circuits before any DB call — passing an undefined
    // client still returns false.
    expect(await getFeatureFlag(null, "lead_canvas_v2")).toBe(false);
  });

  it("returns false on a DB error (graceful fallback, no throw)", async () => {
    const client = stubClient(null, true);
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(false);
  });

  it("returns false when the org row is not found", async () => {
    const client = stubClient(null);
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(false);
  });

  it("guards against truthy-but-non-true values (e.g. 1, 'yes')", async () => {
    const client = stubClient({
      feature_flags: { lead_canvas_v2: 1 as unknown as boolean },
    });
    expect(await getFeatureFlag("org-1", "lead_canvas_v2", client)).toBe(false);
  });
});

describe("getFeatureFlags", () => {
  it("returns the full flag bag", async () => {
    const client = stubClient({
      feature_flags: { lead_canvas_v2: true },
    });
    expect(await getFeatureFlags("org-1", client)).toEqual({
      lead_canvas_v2: true,
    });
  });

  it("returns {} for a null bag", async () => {
    const client = stubClient({ feature_flags: null });
    expect(await getFeatureFlags("org-1", client)).toEqual({});
  });

  it("returns {} on a DB error", async () => {
    const client = stubClient(null, true);
    expect(await getFeatureFlags("org-1", client)).toEqual({});
  });

  it("returns {} when org_id is null", async () => {
    expect(await getFeatureFlags(null)).toEqual({});
  });
});
