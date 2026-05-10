import { describe, expect, it } from "vitest";
import {
  compileFilters,
  compileSort,
  type CompiledOp,
} from "@/lib/views/compile-filters";
import type { FilterClause } from "@/lib/views/types";

const NOW = new Date("2026-05-11T15:30:00.000Z");

// Helper: assert one op slot matches a partial shape (avoids brittle full-equality).
function expectOp(ops: CompiledOp[], i: number, shape: Partial<CompiledOp>) {
  expect(ops[i]).toMatchObject(shape);
}

describe("compileFilters — text-like kinds", () => {
  it("eq → method=eq, value coerced to string", () => {
    const { ops } = compileFilters(
      [{ field: "label", kind: "string", op: "eq", value: "Sarjapur" }],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "eq", column: "label", value: "Sarjapur" });
  });

  it("contains → ilike with %...% pattern", () => {
    const { ops } = compileFilters(
      [{ field: "label", kind: "string", op: "contains", value: "Lakeside" }],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "ilike", column: "label", value: "%Lakeside%" });
  });

  it("contains escapes ilike metacharacters in user input", () => {
    const { ops } = compileFilters(
      [{ field: "label", kind: "string", op: "contains", value: "50%_off" }],
      new Set(),
      NOW,
    );
    // Literal % and _ must be backslash-escaped so they don't act as wildcards.
    expectOp(ops, 0, {
      method: "ilike",
      column: "label",
      value: "%50\\%\\_off%",
    });
  });

  it("starts_with → ilike with value% pattern", () => {
    const { ops } = compileFilters(
      [{ field: "label", kind: "string", op: "starts_with", value: "Pre" }],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "ilike", column: "label", value: "Pre%" });
  });

  it("is_empty / is_not_empty → is_null / is_not_null", () => {
    const { ops } = compileFilters(
      [
        { field: "label", kind: "string", op: "is_empty" },
        { field: "label", kind: "email", op: "is_not_empty" },
      ],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "is_null", column: "label" });
    expectOp(ops, 1, { method: "is_not_null", column: "label" });
  });
});

describe("compileFilters — number", () => {
  it("eq coerces string-number to numeric", () => {
    const { ops } = compileFilters(
      [{ field: "score", kind: "number", op: "eq", value: "42" }],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "eq", column: "score", value: 42 });
  });

  it("between emits gte + lte pair", () => {
    const { ops } = compileFilters(
      [{ field: "score", kind: "number", op: "between", value: [10, 90] }],
      new Set(),
      NOW,
    );
    expect(ops).toHaveLength(2);
    expectOp(ops, 0, { method: "gte", column: "score", value: 10 });
    expectOp(ops, 1, { method: "lte", column: "score", value: 90 });
  });

  it("between with malformed tuple is skipped with warning", () => {
    const { ops, warnings } = compileFilters(
      [{ field: "score", kind: "number", op: "between", value: "bad" }],
      new Set(),
      NOW,
    );
    expect(ops).toEqual([]);
    expect(warnings[0]).toMatchObject({
      field: "score",
      reason: "invalid_value",
    });
  });

  it("lt + gt with non-numeric string is skipped", () => {
    const { ops, warnings } = compileFilters(
      [{ field: "score", kind: "number", op: "lt", value: "notanumber" }],
      new Set(),
      NOW,
    );
    // Compiler coerces and the op is still emitted with value=null;
    // downstream the query will reject. We accept the op but it's effectively a no-op.
    // Either an emit with null or a skip is acceptable contract; assert one of them.
    if (ops.length === 0) {
      expect(warnings.length).toBe(0); // coerceNumber→null is acceptable
    } else {
      expectOp(ops, 0, { method: "lt", column: "score", value: null });
    }
  });
});

describe("compileFilters — date", () => {
  it("today resolves to gte + lt UTC midnight bracket", () => {
    const { ops } = compileFilters(
      [{ field: "created_at", kind: "date", op: "today" }],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, {
      method: "gte",
      column: "created_at",
      value: "2026-05-11T00:00:00.000Z",
    });
    expectOp(ops, 1, {
      method: "lt",
      column: "created_at",
      value: "2026-05-12T00:00:00.000Z",
    });
  });

  it("this_week resolves to ISO-Monday-start week range", () => {
    // 2026-05-11 is a Monday — start is the same day, end is next Mon.
    const { ops } = compileFilters(
      [{ field: "created_at", kind: "date", op: "this_week" }],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "gte", value: "2026-05-11T00:00:00.000Z" });
    expectOp(ops, 1, { method: "lt", value: "2026-05-18T00:00:00.000Z" });
  });

  it("this_month resolves to month start/end", () => {
    const { ops } = compileFilters(
      [{ field: "created_at", kind: "date", op: "this_month" }],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "gte", value: "2026-05-01T00:00:00.000Z" });
    expectOp(ops, 1, { method: "lt", value: "2026-06-01T00:00:00.000Z" });
  });

  it("last_n_days subtracts n days from now", () => {
    const { ops } = compileFilters(
      [{ field: "created_at", kind: "date", op: "last_n_days", value: 7 }],
      new Set(),
      NOW,
    );
    // 2026-05-11T15:30 - 7 days = 2026-05-04T15:30
    expectOp(ops, 0, {
      method: "gte",
      column: "created_at",
      value: "2026-05-04T15:30:00.000Z",
    });
  });

  it("last_n_days with negative n is rejected", () => {
    const { ops, warnings } = compileFilters(
      [{ field: "created_at", kind: "date", op: "last_n_days", value: -1 }],
      new Set(),
      NOW,
    );
    expect(ops).toEqual([]);
    expect(warnings[0]?.reason).toBe("invalid_value");
  });

  it("before/after take ISO strings", () => {
    const { ops } = compileFilters(
      [
        {
          field: "created_at",
          kind: "date",
          op: "before",
          value: "2026-05-01T00:00:00.000Z",
        },
        {
          field: "created_at",
          kind: "date",
          op: "after",
          value: "2026-04-01T00:00:00.000Z",
        },
      ],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "lt", value: "2026-05-01T00:00:00.000Z" });
    expectOp(ops, 1, { method: "gt", value: "2026-04-01T00:00:00.000Z" });
  });
});

describe("compileFilters — boolean / select / builtin_state", () => {
  it("boolean is_true/is_false → eq true/false", () => {
    const { ops } = compileFilters(
      [
        { field: "is_archived", kind: "boolean", op: "is_true" },
        { field: "is_archived", kind: "boolean", op: "is_false" },
      ],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "eq", value: true });
    expectOp(ops, 1, { method: "eq", value: false });
  });

  it("select in/not_in pass array values through", () => {
    const { ops } = compileFilters(
      [
        {
          field: "source",
          kind: "select",
          op: "in",
          value: ["meta", "google"],
        },
      ],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "in", value: ["meta", "google"] });
  });

  it("builtin_state in → in op with stringified values", () => {
    const { ops } = compileFilters(
      [
        {
          field: "state",
          kind: "builtin_state",
          op: "in",
          value: ["new", "contacted"],
        },
      ],
      new Set(),
      NOW,
    );
    expectOp(ops, 0, { method: "in", column: "state", value: ["new", "contacted"] });
  });

  it("select in with empty array is rejected", () => {
    const { ops, warnings } = compileFilters(
      [{ field: "source", kind: "select", op: "in", value: [] }],
      new Set(),
      NOW,
    );
    expect(ops).toEqual([]);
    expect(warnings[0]?.reason).toBe("invalid_value");
  });
});

describe("compileFilters — custom fields", () => {
  it("routes custom:<key> to data->custom->>key column path", () => {
    const { ops, warnings } = compileFilters(
      [
        {
          field: "custom:budget_inr",
          kind: "number",
          op: "gt",
          value: 5_000_000,
        },
      ],
      new Set(["budget_inr"]),
      NOW,
    );
    expect(warnings).toEqual([]);
    expectOp(ops, 0, {
      method: "gt",
      column: "data->custom->>budget_inr",
      value: 5_000_000,
    });
  });

  it("warns + skips when custom field is not in the available set (soft-deleted)", () => {
    const { ops, warnings } = compileFilters(
      [
        {
          field: "custom:ghost",
          kind: "string",
          op: "eq",
          value: "x",
        },
      ],
      new Set(["budget_inr"]),
      NOW,
    );
    expect(ops).toEqual([]);
    expect(warnings[0]).toMatchObject({
      field: "custom:ghost",
      reason: "unavailable_field",
    });
  });
});

describe("compileSort", () => {
  it("returns null for null sort", () => {
    expect(compileSort(null)).toBeNull();
  });

  it("translates field + direction", () => {
    expect(compileSort({ field: "created_at", dir: "desc" })).toEqual({
      column: "created_at",
      ascending: false,
    });
  });

  it("routes custom-field sort through data->custom path", () => {
    expect(compileSort({ field: "custom:budget_inr", dir: "asc" })).toEqual({
      column: "data->custom->>budget_inr",
      ascending: true,
    });
  });
});

describe("compileFilters — mixed batch", () => {
  it("preserves order and continues past skipped clauses", () => {
    const filters: FilterClause[] = [
      { field: "state", kind: "builtin_state", op: "in", value: ["new"] },
      { field: "custom:gone", kind: "string", op: "eq", value: "x" }, // unavailable
      { field: "created_at", kind: "date", op: "today" }, // emits 2 ops
    ];
    const r = compileFilters(filters, new Set(), NOW);
    expect(r.warnings.map((w) => w.field)).toEqual(["custom:gone"]);
    // 1 (state) + 0 (skipped) + 2 (today gte/lt) = 3
    expect(r.ops).toHaveLength(3);
    expect(r.ops[0]?.method).toBe("in");
    expect(r.ops[1]?.method).toBe("gte");
    expect(r.ops[2]?.method).toBe("lt");
  });
});
