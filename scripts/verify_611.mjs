/**
 * D-611 (V6 Phase 3) verification — confirms the directive_versioning
 * migration `20260519150000_directive_versioning.sql` applied correctly.
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_611.mjs
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

const cols = [
  ["version", "integer"],
  ["parent_id", "uuid"],
  ["compiled_dag", "jsonb"],
  ["test_payloads", "jsonb"],
  ["last_test_passed_at", "timestamp with time zone"],
];

try {
  for (const [name, dt] of cols) {
    const q = await c.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='directives' AND column_name=$1`,
      [name],
    );
    check(
      `directives.${name} column exists (${dt})`,
      q.rowCount === 1 && q.rows[0].data_type === dt,
      q.rows[0]?.data_type ?? "(missing)",
    );
  }

  // version default = 1.
  const def = await c.query(`
    SELECT column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='directives' AND column_name='version'
  `);
  check(
    "directives.version default = 1",
    String(def.rows[0]?.column_default ?? "").startsWith("1"),
    def.rows[0]?.column_default,
  );

  // parent_id FK back to directives(id).
  const fk = await c.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.directives'::regclass AND contype='f'
      AND pg_get_constraintdef(oid) LIKE '%REFERENCES directives%'
  `);
  check("parent_id FK on directives(id) present", fk.rowCount >= 1);

  // Partial indexes.
  const idx = await c.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='directives'
  `);
  const names = new Set(idx.rows.map((r) => r.indexname));
  check(
    "directives_parent_idx index exists",
    names.has("directives_parent_idx"),
    [...names].join(", "),
  );
  check(
    "directives_compiled_dag_idx index exists",
    names.has("directives_compiled_dag_idx"),
  );

  // Migration recorded.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260519150000_directive_versioning.sql"],
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
    ? "\nD-611 verify: ALL CHECKS PASS"
    : `\nD-611 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
