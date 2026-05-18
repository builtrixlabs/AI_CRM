import { describe, expect, it } from "vitest";
import {
  cannedLeadFilters,
  cannedLeadLabel,
  isCannedLeadSlug,
  CANNED_LEAD_SLUGS,
} from "@/lib/leads/canned-views";

describe("canned lead views — D-617", () => {
  it("returns a non-empty FilterClause[] for every canned slug", () => {
    for (const slug of CANNED_LEAD_SLUGS) {
      const f = cannedLeadFilters(slug);
      expect(f).not.toBeNull();
      expect(Array.isArray(f)).toBe(true);
      expect(f!.length).toBeGreaterThan(0);
    }
  });

  it("returns null for an unknown slug", () => {
    expect(cannedLeadFilters("not-a-slug")).toBeNull();
    expect(cannedLeadLabel("not-a-slug")).toBeNull();
    expect(isCannedLeadSlug("not-a-slug")).toBe(false);
  });

  it("state-based slugs filter on the `state` column", () => {
    expect(cannedLeadFilters("new-leads")).toEqual([
      { field: "state", kind: "builtin_state", op: "eq", value: "new" },
    ]);
    expect(cannedLeadFilters("terminal-leads")).toEqual([
      {
        field: "state",
        kind: "builtin_state",
        op: "in",
        value: ["lost", "junk", "on_hold"],
      },
    ]);
  });

  it("hot-leads is the active funnel (contacted + qualified)", () => {
    expect(cannedLeadFilters("hot-leads")).toEqual([
      {
        field: "state",
        kind: "builtin_state",
        op: "in",
        value: ["contacted", "qualified"],
      },
    ]);
  });

  it("source-based slugs filter on data->>source with an exact match", () => {
    expect(cannedLeadFilters("leads-magicbricks")).toEqual([
      {
        field: "data->>source",
        kind: "string",
        op: "eq",
        value: "magicbricks",
      },
    ]);
    expect(cannedLeadFilters("leads-99acres")).toEqual([
      { field: "data->>source", kind: "string", op: "eq", value: "99acres" },
    ]);
  });

  it("provides a human label for each slug", () => {
    expect(cannedLeadLabel("new-leads")).toBe("New leads");
    expect(cannedLeadLabel("leads-walkin")).toBe("Walk-in leads");
  });
});
