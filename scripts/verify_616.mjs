/**
 * D-616 (V6 Phase 3) verification — confirms the customer_recovery
 * migration `20260519120000_customer_recovery.sql` applied correctly.
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_616.mjs
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
  // 1. customer_recovery_queue table exists.
  const tbl = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'customer_recovery_queue'
  `);
  check("customer_recovery_queue table exists", tbl.rowCount === 1);

  // 2. recovery_reason CHECK constraint covers all four values.
  const chk = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.customer_recovery_queue'::regclass
      AND contype = 'c'
  `);
  const chkDefs = chk.rows.map((r) => r.def).join(" ; ");
  check(
    "recovery_reason CHECK covers lost / on_hold / stale_contacted / stale_qualified",
    chkDefs.includes("'lost'") &&
      chkDefs.includes("'on_hold'") &&
      chkDefs.includes("'stale_contacted'") &&
      chkDefs.includes("'stale_qualified'"),
    chkDefs,
  );
  check(
    "resolution CHECK covers won_back / unreachable / confirmed_lost",
    chkDefs.includes("'won_back'") &&
      chkDefs.includes("'unreachable'") &&
      chkDefs.includes("'confirmed_lost'"),
  );
  check(
    "resolved_at <-> resolution paired CHECK present",
    chkDefs.includes("resolved_at") && chkDefs.includes("resolution"),
  );
  check(
    "claimed_by <-> claimed_at paired CHECK present",
    chkDefs.includes("claimed_by") && chkDefs.includes("claimed_at"),
  );

  // 3. partial-unique index on (org, lead) WHERE resolved_at IS NULL.
  const idx = await c.query(`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'customer_recovery_queue_open_unique_idx'
  `);
  const idxDef = idx.rows[0]?.indexdef ?? "";
  check(
    "partial-unique index 'one open per (org, lead)' exists",
    idx.rowCount === 1 &&
      idxDef.includes("organization_id") &&
      idxDef.includes("lead_id") &&
      idxDef.toLowerCase().includes("where") &&
      idxDef.includes("resolved_at"),
    idxDef,
  );

  // 4. RLS enabled.
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.customer_recovery_queue'::regclass
  `);
  check(
    "RLS enabled on customer_recovery_queue",
    rls.rows[0]?.relrowsecurity === true,
  );

  // 5. 3 RLS policies (SELECT/INSERT/UPDATE — no DELETE by design).
  const pol = await c.query(`
    SELECT cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_recovery_queue'
  `);
  const cmds = new Set(pol.rows.map((r) => r.cmd));
  check(
    "3 RLS policies present (SELECT / INSERT / UPDATE; no DELETE)",
    pol.rowCount === 3 &&
      cmds.has("SELECT") &&
      cmds.has("INSERT") &&
      cmds.has("UPDATE") &&
      !cmds.has("DELETE"),
    [...cmds].join(", "),
  );

  // 6. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260519120000_customer_recovery.sql"],
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
    ? "\nD-616 verify: ALL CHECKS PASS"
    : `\nD-616 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
