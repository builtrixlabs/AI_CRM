/**
 * D-600 (V6 Phase 2) verification — confirms the brochure-agent migration
 * `20260514180000_brochure_agent_queue.sql` applied: agent_approval_queue
 * gains `attachments jsonb` + `error text`.
 *
 * Run from the repo root (or worktree) with DATABASE_URL available:
 *   node --env-file=.env scripts/verify_600.mjs
 *   node --env-file=../../../.env scripts/verify_600.mjs   # from a worktree
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
  // 1. attachments jsonb column, NOT NULL, default '[]'.
  const att = await c.query(`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_approval_queue'
      AND column_name = 'attachments'
  `);
  check(
    "agent_approval_queue.attachments column exists (jsonb, NOT NULL, default '[]')",
    att.rowCount === 1 &&
      att.rows[0].data_type === "jsonb" &&
      att.rows[0].is_nullable === "NO" &&
      String(att.rows[0].column_default).includes("["),
    att.rows[0]
      ? `${att.rows[0].data_type} nullable=${att.rows[0].is_nullable} default=${att.rows[0].column_default}`
      : "(missing)",
  );

  // 2. error text column, nullable.
  const err = await c.query(`
    SELECT data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_approval_queue'
      AND column_name = 'error'
  `);
  check(
    "agent_approval_queue.error column exists (text, nullable)",
    err.rowCount === 1 &&
      err.rows[0].data_type === "text" &&
      err.rows[0].is_nullable === "YES",
    err.rows[0]
      ? `${err.rows[0].data_type} nullable=${err.rows[0].is_nullable}`
      : "(missing)",
  );

  // 3. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260514180000_brochure_agent_queue.sql"],
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
    ? "\nD-600 verify: ALL CHECKS PASS"
    : `\nD-600 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
