/**
 * D-615 (V6 Phase 2) verification — confirms the directive-lifecycle
 * migration `20260515120100_directive_lifecycle.sql` applied correctly.
 *
 * Run from the repo root with DATABASE_URL available, e.g.:
 *   node --env-file=.env scripts/verify_615.mjs
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
  // 1. The six new columns exist on directives.
  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'directives'
      AND column_name IN ('lifecycle_status','submitted_by','submitted_at',
                          'decided_by','decided_at','rejection_reason')
  `);
  const colSet = new Set(cols.rows.map((r) => r.column_name));
  for (const expected of [
    "lifecycle_status",
    "submitted_by",
    "submitted_at",
    "decided_by",
    "decided_at",
    "rejection_reason",
  ]) {
    check(`directives.${expected} column exists`, colSet.has(expected));
  }

  // 2. lifecycle_status CHECK constraint with the three values.
  const chk = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.directives'::regclass AND contype = 'c'
  `);
  const chkDef = chk.rows.map((r) => r.def).join(" ; ");
  check(
    "lifecycle_status CHECK present (live / pending_approval / archived)",
    chkDef.includes("lifecycle_status") &&
      chkDef.includes("live") &&
      chkDef.includes("pending_approval") &&
      chkDef.includes("archived"),
    chkDef,
  );

  // 3. lifecycle_status defaults to 'live' (existing rows stay live).
  const def = await c.query(`
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'directives'
      AND column_name = 'lifecycle_status'
  `);
  check(
    "lifecycle_status defaults to 'live'",
    (def.rows[0]?.column_default ?? "").includes("live"),
    def.rows[0]?.column_default ?? "(none)",
  );

  // 4. Partial index for the pending-approval queue.
  const idx = await c.query(`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'directives_org_pending_idx'
  `);
  const idxDef = idx.rows[0]?.indexdef ?? "";
  check(
    "directives_org_pending_idx partial index exists",
    idx.rowCount === 1 &&
      idxDef.toLowerCase().includes("where") &&
      idxDef.includes("pending_approval"),
    idxDef,
  );

  // 5. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260515120100_directive_lifecycle.sql"],
  );
  check("migration recorded in applied_migrations ledger", led.rowCount === 1);

  // 6. No existing directive was left non-live by the migration.
  const nonLive = await c.query(`
    SELECT count(*)::int AS n FROM public.directives
    WHERE lifecycle_status <> 'live' AND submitted_by IS NULL
  `);
  check(
    "pre-D-615 directives all defaulted to 'live'",
    (nonLive.rows[0]?.n ?? 0) === 0,
    `${nonLive.rows[0]?.n ?? 0} non-live rows with no submitter`,
  );
} catch (e) {
  console.error("verify FAILED with error:", e.message);
  failures += 1;
} finally {
  await c.end();
}

console.log(
  failures === 0
    ? "\nD-615 verify: ALL CHECKS PASS"
    : `\nD-615 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
