// D-413 / compile-filters
//
// Pure function: translate a view's FilterClause[] into a list of Supabase
// PostgREST filter operations. The page applies these to the query builder.
//
// No SQL is constructed here. The output is a declarative op list — the
// runtime just dispatches over { method, column, value }. Safe for fuzzing
// because every reachable op maps to a documented Supabase client method.

import {
  customFieldKey,
  isCustomFieldRef,
  type FilterClause,
  type SortClause,
} from "./types";

export type CompiledOp =
  | { method: "eq"; column: string; value: unknown }
  | { method: "neq"; column: string; value: unknown }
  | { method: "ilike"; column: string; value: string }
  | { method: "is_null"; column: string }
  | { method: "is_not_null"; column: string }
  | { method: "lt"; column: string; value: unknown }
  | { method: "gt"; column: string; value: unknown }
  | { method: "lte"; column: string; value: unknown }
  | { method: "gte"; column: string; value: unknown }
  | { method: "in"; column: string; value: unknown[] }
  | { method: "not_in"; column: string; value: unknown[] };

export type CompileWarning = {
  field: string;
  reason: "unavailable_field" | "invalid_value" | "unsupported_op_for_kind";
};

export type CompileResult = {
  ops: CompiledOp[];
  warnings: CompileWarning[];
};

// `now` is injectable so tests are deterministic.
export function compileFilters(
  filters: FilterClause[],
  availableCustomFields: ReadonlySet<string>,
  now: Date = new Date(),
): CompileResult {
  const ops: CompiledOp[] = [];
  const warnings: CompileWarning[] = [];

  for (const f of filters) {
    const column = columnFor(f.field);
    if (isCustomFieldRef(f.field)) {
      const k = customFieldKey(f.field);
      if (!availableCustomFields.has(k)) {
        warnings.push({ field: f.field, reason: "unavailable_field" });
        continue;
      }
    }

    const out = compileOne(column, f, now);
    if (out.kind === "ok") {
      ops.push(...out.ops);
    } else {
      warnings.push({ field: f.field, reason: out.reason });
    }
  }

  return { ops, warnings };
}

export function compileSort(sort: SortClause | null): {
  column: string;
  ascending: boolean;
} | null {
  if (!sort) return null;
  return { column: columnFor(sort.field), ascending: sort.dir === "asc" };
}

// ── Internals ────────────────────────────────────────────────────────────

function columnFor(field: string): string {
  if (isCustomFieldRef(field)) {
    return `data->custom->>${customFieldKey(field)}`;
  }
  return field;
}

type CompileOne =
  | { kind: "ok"; ops: CompiledOp[] }
  | { kind: "skip"; reason: CompileWarning["reason"] };

function compileOne(column: string, f: FilterClause, now: Date): CompileOne {
  const { op, kind, value } = f;

  // text-like ops (string | email | phone)
  if (kind === "string" || kind === "email" || kind === "phone") {
    switch (op) {
      case "eq":
        return ok({ method: "eq", column, value: String(value ?? "") });
      case "neq":
        return ok({ method: "neq", column, value: String(value ?? "") });
      case "contains":
        return ok({
          method: "ilike",
          column,
          value: `%${escapeIlike(String(value ?? ""))}%`,
        });
      case "starts_with":
        return ok({
          method: "ilike",
          column,
          value: `${escapeIlike(String(value ?? ""))}%`,
        });
      case "is_empty":
        return ok({ method: "is_null", column });
      case "is_not_empty":
        return ok({ method: "is_not_null", column });
    }
    return skip("unsupported_op_for_kind");
  }

  // number
  if (kind === "number") {
    switch (op) {
      case "eq":
        return ok({ method: "eq", column, value: coerceNumber(value) });
      case "neq":
        return ok({ method: "neq", column, value: coerceNumber(value) });
      case "lt":
        return ok({ method: "lt", column, value: coerceNumber(value) });
      case "gt":
        return ok({ method: "gt", column, value: coerceNumber(value) });
      case "between": {
        const [lo, hi] = expectTuple(value);
        if (lo === null || hi === null) return skip("invalid_value");
        return ok(
          { method: "gte", column, value: coerceNumber(lo) },
          { method: "lte", column, value: coerceNumber(hi) },
        );
      }
      case "is_empty":
        return ok({ method: "is_null", column });
    }
    return skip("unsupported_op_for_kind");
  }

  // date (timestamptz). Relative ops resolve to absolute ranges from `now`.
  if (kind === "date") {
    switch (op) {
      case "today": {
        const { start, end } = rangeForDay(now);
        return ok(
          { method: "gte", column, value: start },
          { method: "lt", column, value: end },
        );
      }
      case "this_week": {
        const { start, end } = rangeForWeek(now);
        return ok(
          { method: "gte", column, value: start },
          { method: "lt", column, value: end },
        );
      }
      case "this_month": {
        const { start, end } = rangeForMonth(now);
        return ok(
          { method: "gte", column, value: start },
          { method: "lt", column, value: end },
        );
      }
      case "last_n_days": {
        const n = coerceNumber(value);
        if (n === null || n < 0) return skip("invalid_value");
        const start = new Date(now.getTime() - n * 86_400_000);
        return ok({ method: "gte", column, value: start.toISOString() });
      }
      case "before":
        if (typeof value !== "string") return skip("invalid_value");
        return ok({ method: "lt", column, value });
      case "after":
        if (typeof value !== "string") return skip("invalid_value");
        return ok({ method: "gt", column, value });
      case "between": {
        const [lo, hi] = expectTuple(value);
        if (typeof lo !== "string" || typeof hi !== "string")
          return skip("invalid_value");
        return ok(
          { method: "gte", column, value: lo },
          { method: "lt", column, value: hi },
        );
      }
    }
    return skip("unsupported_op_for_kind");
  }

  // boolean
  if (kind === "boolean") {
    if (op === "is_true") return ok({ method: "eq", column, value: true });
    if (op === "is_false") return ok({ method: "eq", column, value: false });
    return skip("unsupported_op_for_kind");
  }

  // select (string[] options)
  if (kind === "select") {
    if (op === "in" || op === "not_in") {
      if (!Array.isArray(value) || value.length === 0)
        return skip("invalid_value");
      return ok({
        method: op === "in" ? "in" : "not_in",
        column,
        value: value.map(String),
      });
    }
    if (op === "eq" && typeof value === "string")
      return ok({ method: "eq", column, value });
    return skip("unsupported_op_for_kind");
  }

  // builtin_state — same shape as select, never custom-field
  if (kind === "builtin_state") {
    if (op === "in" || op === "not_in") {
      if (!Array.isArray(value) || value.length === 0)
        return skip("invalid_value");
      return ok({
        method: op === "in" ? "in" : "not_in",
        column,
        value: value.map(String),
      });
    }
    if (op === "eq" && typeof value === "string")
      return ok({ method: "eq", column, value });
    return skip("unsupported_op_for_kind");
  }

  return skip("unsupported_op_for_kind");
}

function ok(...ops: CompiledOp[]): CompileOne {
  return { kind: "ok", ops };
}
function skip(reason: CompileWarning["reason"]): CompileOne {
  return { kind: "skip", reason };
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function expectTuple(v: unknown): [unknown, unknown] {
  if (Array.isArray(v) && v.length === 2) return [v[0], v[1]];
  return [null, null];
}

// Escape ilike special chars so user input cannot inject pattern metacharacters.
function escapeIlike(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}

function rangeForDay(now: Date): { start: string; end: string } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function rangeForWeek(now: Date): { start: string; end: string } {
  // ISO week: Monday is the first day.
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Mon
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - dow);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function rangeForMonth(now: Date): { start: string; end: string } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start: start.toISOString(), end: end.toISOString() };
}
