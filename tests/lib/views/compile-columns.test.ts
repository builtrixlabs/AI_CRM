/**
 * D-413 — compileColumns: merge a view's saved columns with the org's live
 * custom-field catalog. Pure function, no I/O.
 */
import { describe, expect, it } from "vitest";
import { compileColumns } from "@/lib/views/compile-columns";
import type {
  ColumnSpec,
  CustomViewRow,
  ViewEntityType,
} from "@/lib/views/types";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeView(over: Partial<CustomViewRow>): CustomViewRow {
  return {
    id: "view-1",
    organization_id: ORG,
    entity_type: "lead" as ViewEntityType,
    scope: "user",
    owner_id: null,
    name: "Test view",
    slug: "test",
    filters: [],
    columns: [],
    sort: null,
    created_at: "2026-05-11T00:00:00Z",
    deleted_at: null,
    ...over,
  };
}

const FALLBACK: ColumnSpec[] = [
  { field: "label" },
  { field: "state" },
];

describe("compileColumns", () => {
  it("returns fallback when view is null", () => {
    expect(
      compileColumns({ view: null, customFieldDefs: [], fallback: FALLBACK }),
    ).toEqual(FALLBACK);
  });

  it("returns fallback when view has zero columns", () => {
    expect(
      compileColumns({
        view: makeView({ columns: [] }),
        customFieldDefs: [],
        fallback: FALLBACK,
      }),
    ).toEqual(FALLBACK);
  });

  it("passes through non-custom columns unchanged", () => {
    const cols: ColumnSpec[] = [
      { field: "label", label: "Name" },
      { field: "state", label: "Status" },
    ];
    expect(
      compileColumns({
        view: makeView({ columns: cols }),
        customFieldDefs: [],
        fallback: FALLBACK,
      }),
    ).toEqual(cols);
  });

  it("drops custom: columns whose field has been deleted from the org", () => {
    const cols: ColumnSpec[] = [
      { field: "label" },
      { field: "custom:zombie" },
      { field: "custom:budget" },
    ];
    const result = compileColumns({
      view: makeView({ columns: cols }),
      customFieldDefs: [{ field_key: "budget", label: "Budget" }],
      fallback: FALLBACK,
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.field)).toEqual(["label", "custom:budget"]);
  });

  it("back-fills custom: column label from the field definition when label is empty", () => {
    const cols: ColumnSpec[] = [{ field: "custom:budget" }];
    const result = compileColumns({
      view: makeView({ columns: cols }),
      customFieldDefs: [{ field_key: "budget", label: "Budget (INR)" }],
      fallback: FALLBACK,
    });
    expect(result[0]).toEqual({
      field: "custom:budget",
      label: "Budget (INR)",
    });
  });

  it("preserves explicit label on custom: columns (does NOT overwrite)", () => {
    const cols: ColumnSpec[] = [{ field: "custom:budget", label: "₹ Range" }];
    const result = compileColumns({
      view: makeView({ columns: cols }),
      customFieldDefs: [{ field_key: "budget", label: "Budget (INR)" }],
      fallback: FALLBACK,
    });
    expect(result[0]?.label).toBe("₹ Range");
  });

  it("preserves explicit label on built-in columns (does NOT overwrite)", () => {
    const cols: ColumnSpec[] = [{ field: "label", label: "Name" }];
    const result = compileColumns({
      view: makeView({ columns: cols }),
      customFieldDefs: [],
      fallback: FALLBACK,
    });
    expect(result[0]).toEqual({ field: "label", label: "Name" });
  });
});
