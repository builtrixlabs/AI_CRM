/**
 * D-610 (V6 Phase 1) verification — confirms the presales-allocation
 * migration `20260514160000_presales_allocation.sql` applied correctly.
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_610.mjs
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
  // 1. The three tables exist.
  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('lead_allocation_rules', 'lead_allocation_state', 'team_members')
  `);
  const tableSet = new Set(tables.rows.map((r) => r.table_name));
  check("lead_allocation_rules table exists", tableSet.has("lead_allocation_rules"));
  check("lead_allocation_state table exists", tableSet.has("lead_allocation_state"));
  check("team_members table exists", tableSet.has("team_members"));

  // 2. lead_allocation_rules target_kind CHECK covers the three kinds.
  const con = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.lead_allocation_rules'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%target_kind%'
  `);
  const def = con.rows[0]?.def ?? "";
  check(
    "target_kind CHECK covers user / team_round_robin / team_first_available",
    ["user", "team_round_robin", "team_first_available"].every((k) =>
      def.includes(k),
    ),
    def,
  );

  // 3. UNIQUE (organization_id, priority) on rules.
  const uq = await c.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.lead_allocation_rules'::regclass
      AND contype = 'u'
  `);
  check(
    "UNIQUE (organization_id, priority) on lead_allocation_rules",
    uq.rowCount === 1,
    uq.rows[0]?.conname,
  );

  // 4. team_members composite PK (team_id, profile_id).
  const pk = await c.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'public.team_members'::regclass AND i.indisprimary
  `);
  const pkCols = pk.rows.map((r) => r.attname).sort();
  check(
    "team_members PK is (profile_id, team_id)",
    JSON.stringify(pkCols) === JSON.stringify(["profile_id", "team_id"]),
    pkCols.join(", "),
  );

  // 5. lead_allocation_state composite PK (organization_id, team_id).
  const pk2 = await c.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'public.lead_allocation_state'::regclass AND i.indisprimary
  `);
  const pk2Cols = pk2.rows.map((r) => r.attname).sort();
  check(
    "lead_allocation_state PK is (organization_id, team_id)",
    JSON.stringify(pk2Cols) === JSON.stringify(["organization_id", "team_id"]),
    pk2Cols.join(", "),
  );

  // 6. RLS enabled on all three.
  for (const t of [
    "lead_allocation_rules",
    "lead_allocation_state",
    "team_members",
  ]) {
    const rls = await c.query(
      `SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass`,
      [`public.${t}`],
    );
    check(`RLS enabled on ${t}`, rls.rows[0]?.relrowsecurity === true);
  }

  // 7. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260514160000_presales_allocation.sql"],
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
    ? "\nD-610 verify: ALL CHECKS PASS"
    : `\nD-610 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
