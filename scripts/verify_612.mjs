/**
 * D-612 (V6 Phase 3) verification — confirms the team_dashboard_assignments
 * migration `20260519140000_team_dashboard_assignments.sql` applied
 * correctly.
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_612.mjs
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
  // 1. table exists
  const t = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='team_dashboard_assignments'
  `);
  check("team_dashboard_assignments table exists", t.rowCount === 1);

  // 2. UNIQUE (dashboard_id, team_id)
  const uq = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='public.team_dashboard_assignments'::regclass AND contype='u'
  `);
  const uqDef = uq.rows.map((r) => r.def).join(" ; ");
  check(
    "UNIQUE (dashboard_id, team_id) constraint present",
    uq.rowCount >= 1 &&
      uqDef.includes("dashboard_id") &&
      uqDef.includes("team_id"),
    uqDef,
  );

  // 3. RLS enabled + 4 policies (SELECT/INSERT/UPDATE/DELETE)
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid='public.team_dashboard_assignments'::regclass
  `);
  check("RLS enabled on team_dashboard_assignments",
    rls.rows[0]?.relrowsecurity === true);
  const pol = await c.query(`
    SELECT cmd FROM pg_policies
    WHERE schemaname='public' AND tablename='team_dashboard_assignments'
  `);
  const cmds = new Set(pol.rows.map((r) => r.cmd));
  check(
    "4 RLS policies present (SELECT/INSERT/UPDATE/DELETE)",
    pol.rowCount === 4 &&
      ["SELECT", "INSERT", "UPDATE", "DELETE"].every((x) => cmds.has(x)),
    [...cmds].join(", "),
  );

  // 4. FK to dashboard_definitions + teams (ensures clean cascade).
  const fk = await c.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.team_dashboard_assignments'::regclass AND contype='f'
  `);
  check("FK constraints present (dashboard_id + team_id)", fk.rowCount >= 2);

  // 5. Migration recorded.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260519140000_team_dashboard_assignments.sql"],
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
    ? "\nD-612 verify: ALL CHECKS PASS"
    : `\nD-612 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
