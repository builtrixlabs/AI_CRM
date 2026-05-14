/**
 * D-601 (V6 Phase 2) verification — confirms the migration
 * `20260514190000_agent_queue_ref_node.sql` applied:
 * agent_approval_queue gains `ref_node_id uuid` REFERENCES nodes(id).
 *
 * Run from the repo root (or worktree) with DATABASE_URL available:
 *   node --env-file=.env scripts/verify_601.mjs
 *   node --env-file=../../../.env scripts/verify_601.mjs   # from a worktree
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
  // 1. ref_node_id column exists (uuid, nullable).
  const col = await c.query(`
    SELECT data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_approval_queue'
      AND column_name = 'ref_node_id'
  `);
  check(
    "agent_approval_queue.ref_node_id column exists (uuid, nullable)",
    col.rowCount === 1 &&
      col.rows[0].data_type === "uuid" &&
      col.rows[0].is_nullable === "YES",
    col.rows[0]
      ? `${col.rows[0].data_type} nullable=${col.rows[0].is_nullable}`
      : "(missing)",
  );

  // 2. FK to nodes(id) present.
  const fk = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.agent_approval_queue'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) ILIKE '%ref_node_id%'
  `);
  const fkDef = fk.rows[0]?.def ?? "";
  check(
    "ref_node_id FK references nodes(id)",
    fk.rowCount >= 1 && /REFERENCES\s+(public\.)?nodes\s*\(\s*id\s*\)/i.test(fkDef),
    fkDef || "(missing)",
  );

  // 3. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260514190000_agent_queue_ref_node.sql"],
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
    ? "\nD-601 verify: ALL CHECKS PASS"
    : `\nD-601 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
