/**
 * D-614 (V6 Phase 2) verification — confirms the agent_message_policies
 * migration `20260515120000_agent_message_policies.sql` applied correctly.
 *
 * Run from the repo root with DATABASE_URL available, e.g.:
 *   node --env-file=.env scripts/verify_614.mjs
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
  // 1. agent_message_policies table exists.
  const tbl = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_message_policies'
  `);
  check("agent_message_policies table exists", tbl.rowCount === 1);

  // 2. mode CHECK constraint present with both policy values.
  const chk = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.agent_message_policies'::regclass AND contype = 'c'
  `);
  const chkDef = chk.rows.map((r) => r.def).join(" ; ");
  check(
    "mode CHECK constraint present (auto_send / require_approval)",
    chk.rowCount >= 1 &&
      chkDef.includes("auto_send") &&
      chkDef.includes("require_approval"),
    chkDef,
  );

  // 3. Composite primary key on (organization_id, agent_kind).
  const pk = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.agent_message_policies'::regclass AND contype = 'p'
  `);
  const pkDef = pk.rows[0]?.def ?? "";
  check(
    "primary key on (organization_id, agent_kind)",
    pk.rowCount === 1 &&
      pkDef.includes("organization_id") &&
      pkDef.includes("agent_kind"),
    pkDef,
  );

  // 4. RLS enabled.
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.agent_message_policies'::regclass
  `);
  check(
    "RLS enabled on agent_message_policies",
    rls.rows[0]?.relrowsecurity === true,
  );

  // 5. 4 RLS policies (SELECT/INSERT/UPDATE/DELETE).
  const pol = await c.query(`
    SELECT cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_message_policies'
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
    ["20260515120000_agent_message_policies.sql"],
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
    ? "\nD-614 verify: ALL CHECKS PASS"
    : `\nD-614 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
