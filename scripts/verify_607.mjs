/**
 * D-607 (V6 Phase 2) verification — confirms the brochures migration
 * `20260514170000_brochures.sql` applied correctly AND the private
 * `brochures` Storage bucket exists.
 *
 * Run from the repo root with DATABASE_URL available, e.g.:
 *   node --env-file=.env scripts/verify_607.mjs
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
  // 1. brochures table exists.
  const tbl = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'brochures'
  `);
  check("brochures table exists", tbl.rowCount === 1);

  // 2. document_type CHECK constraint present.
  const chk = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.brochures'::regclass AND contype = 'c'
  `);
  const chkDef = chk.rows.map((r) => r.def).join(" ; ");
  check(
    "document_type CHECK constraint present",
    chk.rowCount >= 1 && chkDef.includes("document_type") &&
      chkDef.includes("floor_plan"),
    chkDef,
  );

  // 3. Partial index on (organization_id, project_id).
  const idx = await c.query(`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'brochures_org_project_idx'
  `);
  const idxDef = idx.rows[0]?.indexdef ?? "";
  check(
    "brochures_org_project_idx partial index exists",
    idx.rowCount === 1 && idxDef.toLowerCase().includes("where") &&
      idxDef.includes("project_id"),
    idxDef,
  );

  // 4. RLS enabled.
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.brochures'::regclass
  `);
  check("RLS enabled on brochures", rls.rows[0]?.relrowsecurity === true);

  // 5. 4 RLS policies (SELECT/INSERT/UPDATE/DELETE).
  const pol = await c.query(`
    SELECT cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brochures'
  `);
  const cmds = new Set(pol.rows.map((r) => r.cmd));
  check(
    "4 RLS policies present (SELECT/INSERT/UPDATE/DELETE)",
    pol.rowCount === 4 &&
      ["SELECT", "INSERT", "UPDATE", "DELETE"].every((x) => cmds.has(x)),
    [...cmds].join(", "),
  );

  // 6. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260514170000_brochures.sql"],
  );
  check("migration recorded in applied_migrations ledger", led.rowCount === 1);

  // 7. Private `brochures` Storage bucket exists (created by
  //    scripts/ensure_brochures_bucket.mjs — reading storage.buckets works
  //    even where writing it would not).
  const bkt = await c.query(
    `SELECT public FROM storage.buckets WHERE id = 'brochures'`,
  );
  check(
    "storage bucket 'brochures' exists and is private",
    bkt.rowCount === 1 && bkt.rows[0].public === false,
    bkt.rowCount === 1 ? `public=${bkt.rows[0].public}` : "(missing — run ensure_brochures_bucket.mjs)",
  );
} catch (e) {
  console.error("verify FAILED with error:", e.message);
  failures += 1;
} finally {
  await c.end();
}

console.log(
  failures === 0
    ? "\nD-607 verify: ALL CHECKS PASS"
    : `\nD-607 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
