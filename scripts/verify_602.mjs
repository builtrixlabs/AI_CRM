/**
 * D-602 (V6 Phase 1) verification — confirms the two D-602 migrations
 * applied correctly:
 *   20260514130000_v6_role_extensions.sql
 *   20260514130100_site_visit_v6.sql
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_602.mjs
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
  // 1. base_role enum gained the four V6 roles.
  const enumVals = await c.query(`
    SELECT e.enumlabel AS label
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'base_role'
  `);
  const labels = new Set(enumVals.rows.map((r) => r.label));
  for (const role of [
    "presales_rep",
    "telemarketing_rep",
    "customer_recovery_rep",
    "site_visit_coordinator",
  ]) {
    check(`base_role enum has '${role}'`, labels.has(role));
  }

  // 2. site_visit_coordinator_claims table exists.
  const tbl = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'site_visit_coordinator_claims'
  `);
  check("site_visit_coordinator_claims table exists", tbl.rowCount === 1);

  // 3. Composite PK (organization_id, coordination_date) — the claim mutex.
  const pk = await c.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'public.site_visit_coordinator_claims'::regclass
      AND i.indisprimary
  `);
  const pkCols = pk.rows.map((r) => r.attname).sort();
  check(
    "PK is (coordination_date, organization_id)",
    JSON.stringify(pkCols) ===
      JSON.stringify(["coordination_date", "organization_id"]),
    pkCols.join(", "),
  );

  // 4. RLS enabled.
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.site_visit_coordinator_claims'::regclass
  `);
  check(
    "RLS enabled on site_visit_coordinator_claims",
    rls.rows[0]?.relrowsecurity === true,
  );

  // 5. Three RLS policies (select / insert / delete).
  const pol = await c.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'site_visit_coordinator_claims'
  `);
  check(
    "3 RLS policies present (select/insert/delete)",
    pol.rowCount === 3,
    pol.rows.map((r) => r.policyname).join(", "),
  );

  // 6. nodes date-filter index exists (AC-5).
  const idx = await c.query(`
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'nodes_site_visit_scheduled_at_idx'
  `);
  check("nodes_site_visit_scheduled_at_idx index exists", idx.rowCount === 1);

  // 7. Both migrations recorded in the idempotency ledger.
  for (const m of [
    "20260514130000_v6_role_extensions.sql",
    "20260514130100_site_visit_v6.sql",
  ]) {
    const led = await c.query(
      `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
      [m],
    );
    check(`migration ${m} recorded in ledger`, led.rowCount === 1);
  }
} catch (e) {
  console.error("verify FAILED with error:", e.message);
  failures += 1;
} finally {
  await c.end();
}

console.log(
  failures === 0
    ? "\nD-602 verify: ALL CHECKS PASS"
    : `\nD-602 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
