/**
 * D-608 (V6 Phase 1) verification — confirms the project_sales_mapping
 * migration `20260514150000_project_sales_mapping.sql` applied correctly.
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_608.mjs
 *
 * Exits 0 if every check passes, 1 otherwise.
 */
import { Client } from "pg";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const c = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
}

try {
  // 1. project_sales_assignments table exists.
  const tbl = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'project_sales_assignments'
  `);
  check("project_sales_assignments table exists", tbl.rowCount === 1);

  // 2. UNIQUE (organization_id, project_id, sales_rep_id).
  const uq = await c.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_sales_assignments'::regclass
      AND contype = 'u'
  `);
  check(
    "UNIQUE (org, project, sales_rep) constraint present",
    uq.rowCount === 1,
    uq.rows[0]?.conname,
  );

  // 3. Partial unique index — at most one primary per (org, project).
  const idx = await c.query(`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'project_sales_assignments_one_primary_idx'
  `);
  const idxDef = idx.rows[0]?.indexdef ?? "";
  check(
    "partial unique index 'one primary per project' exists",
    idx.rowCount === 1 && idxDef.toLowerCase().includes("where") &&
      idxDef.includes("is_primary"),
    idxDef,
  );

  // 4. RLS enabled + 4 policies (select/insert/update/delete).
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.project_sales_assignments'::regclass
  `);
  check(
    "RLS enabled on project_sales_assignments",
    rls.rows[0]?.relrowsecurity === true,
  );
  const pol = await c.query(`
    SELECT cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_sales_assignments'
  `);
  const cmds = new Set(pol.rows.map((r) => r.cmd));
  check(
    "4 RLS policies present (SELECT/INSERT/UPDATE/DELETE)",
    pol.rowCount === 4 &&
      ["SELECT", "INSERT", "UPDATE", "DELETE"].every((c2) => cmds.has(c2)),
    [...cmds].join(", "),
  );

  // 5. profiles.on_leave column exists with the right default.
  const col = await c.query(`
    SELECT data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'on_leave'
  `);
  check(
    "profiles.on_leave column exists (boolean, default false)",
    col.rowCount === 1 &&
      col.rows[0].data_type === "boolean" &&
      String(col.rows[0].column_default).includes("false"),
    col.rows[0] ? `${col.rows[0].data_type} default ${col.rows[0].column_default}` : "(missing)",
  );

  // 6. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260514150000_project_sales_mapping.sql"],
  );
  check("migration recorded in applied_migrations ledger", led.rowCount === 1);
} catch (e) {
  console.error("verify FAILED with error:", e.message);
  failures += 1;
} finally {
  await c.end();
}

console.log(
  failures === 0
    ? "\nD-608 verify: ALL CHECKS PASS"
    : `\nD-608 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
