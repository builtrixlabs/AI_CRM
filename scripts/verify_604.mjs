/**
 * D-604 (V6 Phase 1) verification — confirms the MIH inbound migration
 * `20260514140000_mih_lead_inbound.sql` applied correctly.
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_604.mjs
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
  // 1-2. nodes provenance columns (baseline 122 §7).
  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes'
      AND column_name IN ('source_external_id', 'source_payload')
  `);
  const colSet = new Set(cols.rows.map((r) => r.column_name));
  check("nodes.source_external_id column exists", colSet.has("source_external_id"));
  check("nodes.source_payload column exists", colSet.has("source_payload"));

  // 3. Dedup index.
  const idx = await c.query(`
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'nodes_source_external_id_idx'
  `);
  check("nodes_source_external_id_idx index exists", idx.rowCount === 1);

  // 4. mih_inbound_log table.
  const tbl = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mih_inbound_log'
  `);
  check("mih_inbound_log table exists", tbl.rowCount === 1);

  // 5. status CHECK constraint allows the four outcomes.
  const con = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.mih_inbound_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  `);
  const def = con.rows[0]?.def ?? "";
  check(
    "mih_inbound_log.status CHECK covers all four outcomes",
    ["created", "duplicate_merged", "rejected", "rate_limited"].every((s) =>
      def.includes(s),
    ),
    def,
  );

  // 6. RLS enabled.
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.mih_inbound_log'::regclass
  `);
  check(
    "RLS enabled on mih_inbound_log",
    rls.rows[0]?.relrowsecurity === true,
  );

  // 7. SELECT RLS policy present (writes are service-role only).
  const pol = await c.query(`
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mih_inbound_log'
  `);
  check(
    "mih_inbound_log has exactly one SELECT policy",
    pol.rowCount === 1 && pol.rows[0]?.cmd === "SELECT",
    pol.rows.map((r) => `${r.policyname}:${r.cmd}`).join(", "),
  );

  // 8. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260514140000_mih_lead_inbound.sql"],
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
    ? "\nD-604 verify: ALL CHECKS PASS"
    : `\nD-604 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
