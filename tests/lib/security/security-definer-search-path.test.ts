import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-330 — structural assertion that every SECURITY DEFINER function we
 * ship declares an explicit `SET search_path = public` (or another
 * non-mutable schema). Without this, a malicious schema entry on the
 * caller's `search_path` could override built-ins like `pg_catalog.lower`
 * and escape the function's intended logic.
 *
 * Lives at the unit-test layer (NOT live-DB) so it runs in default CI
 * and catches regressions before the migration ever hits prod.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

type FnDef = {
  file: string;
  name: string;
  body: string;
};

function* iterFiles(): Generator<string> {
  for (const f of readdirSync(MIGRATIONS_DIR).sort()) {
    if (f.endsWith(".sql")) yield f;
  }
}

function extractSecurityDefinerFunctions(sql: string): FnDef[] {
  const out: FnDef[] = [];
  // Match `CREATE [OR REPLACE] FUNCTION <schema.>name (...) ... SECURITY DEFINER ... AS $$ ... $$`
  // We use a permissive regex that captures the function name + the body
  // up to the closing `$$;`.
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\([^)]*\)([\s\S]*?)\$\$\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const headerAndBody = m[2] ?? "";
    if (!/SECURITY\s+DEFINER/i.test(headerAndBody)) continue;
    out.push({ file: "", name: m[1] ?? "<unknown>", body: headerAndBody });
  }
  return out;
}

function hasSearchPathSet(body: string): boolean {
  return /SET\s+search_path\s*(?:=|TO)\s*[\w,\s.]+/i.test(body);
}

describe("SECURITY DEFINER functions declare explicit search_path", () => {
  const allDefiners: FnDef[] = [];
  for (const f of iterFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    for (const fn of extractSecurityDefinerFunctions(sql)) {
      allDefiners.push({ ...fn, file: f });
    }
  }

  it("at least one SECURITY DEFINER function exists (sanity)", () => {
    expect(allDefiners.length).toBeGreaterThan(0);
  });

  it.each(allDefiners.map((d) => [d.file, d.name, d]))(
    "%s :: %s has SET search_path",
    (_file, _name, def) => {
      const d = def as FnDef;
      expect(
        hasSearchPathSet(d.body),
        `SECURITY DEFINER fn ${d.name} in ${d.file} is missing 'SET search_path = public' (search-path injection vector)`
      ).toBe(true);
    }
  );
});
