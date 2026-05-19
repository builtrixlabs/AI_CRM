/**
 * D-606 (V6 Phase 3) verification — confirms the super_admin_v6 migration
 * `20260519130000_super_admin_v6.sql` applied correctly.
 *
 * Run from the worktree with DATABASE_URL available, e.g.:
 *   node --env-file=../../../.env scripts/verify_606.mjs
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
  // 1. super_admin_impersonation_log table exists.
  const t1 = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='super_admin_impersonation_log'
  `);
  check("super_admin_impersonation_log table exists", t1.rowCount === 1);

  // 2. reason length CHECK.
  const chk1 = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='public.super_admin_impersonation_log'::regclass AND contype='c'
  `);
  const chk1Def = chk1.rows.map((r) => r.def).join(" ; ");
  check(
    "reason length CHECK >= 10",
    chk1Def.includes("length(reason)") && chk1Def.includes("10"),
    chk1Def,
  );

  // 3. RLS enabled on impersonation_log; 3 policies (no DELETE).
  const rls1 = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid='public.super_admin_impersonation_log'::regclass
  `);
  check("RLS enabled on super_admin_impersonation_log",
    rls1.rows[0]?.relrowsecurity === true);
  const pol1 = await c.query(`
    SELECT cmd FROM pg_policies
    WHERE schemaname='public' AND tablename='super_admin_impersonation_log'
  `);
  const cmds1 = new Set(pol1.rows.map((r) => r.cmd));
  check(
    "3 RLS policies on impersonation_log (SELECT/INSERT/UPDATE; no DELETE)",
    pol1.rowCount === 3 && cmds1.has("SELECT") && cmds1.has("INSERT") &&
      cmds1.has("UPDATE") && !cmds1.has("DELETE"),
    [...cmds1].join(", "),
  );

  // 4. platform_defects table exists.
  const t2 = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='platform_defects'
  `);
  check("platform_defects table exists", t2.rowCount === 1);

  // 5. severity + status CHECKs.
  const chk2 = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='public.platform_defects'::regclass AND contype='c'
  `);
  const chk2Def = chk2.rows.map((r) => r.def).join(" ; ");
  check(
    "severity CHECK covers P0/P1/P2/P3",
    chk2Def.includes("'P0'") && chk2Def.includes("'P1'") &&
      chk2Def.includes("'P2'") && chk2Def.includes("'P3'"),
  );
  check(
    "status CHECK covers open/triaged/in_progress/resolved/wont_fix",
    chk2Def.includes("'open'") && chk2Def.includes("'triaged'") &&
      chk2Def.includes("'in_progress'") && chk2Def.includes("'resolved'") &&
      chk2Def.includes("'wont_fix'"),
  );
  check(
    "resolved_at <-> status paired CHECK present",
    chk2Def.includes("resolved_at") &&
      // Postgres normalises `status NOT IN ('resolved','wont_fix')` to
      // either `status <> ALL (...)` or `NOT (status = ANY (...))`.
      (chk2Def.includes("<> ALL") || chk2Def.includes("status NOT IN") ||
        chk2Def.includes("NOT (status = ANY")),
    chk2Def,
  );

  // 6. RLS + 3 policies on platform_defects.
  const rls2 = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid='public.platform_defects'::regclass
  `);
  check("RLS enabled on platform_defects",
    rls2.rows[0]?.relrowsecurity === true);
  const pol2 = await c.query(`
    SELECT cmd FROM pg_policies
    WHERE schemaname='public' AND tablename='platform_defects'
  `);
  const cmds2 = new Set(pol2.rows.map((r) => r.cmd));
  check(
    "3 RLS policies on platform_defects (SELECT/INSERT/UPDATE; no DELETE)",
    pol2.rowCount === 3 && cmds2.has("SELECT") && cmds2.has("INSERT") &&
      cmds2.has("UPDATE") && !cmds2.has("DELETE"),
    [...cmds2].join(", "),
  );

  // 7. organizations.feature_flags column exists.
  const col = await c.query(`
    SELECT data_type, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organizations'
      AND column_name='feature_flags'
  `);
  check(
    "organizations.feature_flags column exists (jsonb, default '{}')",
    col.rowCount === 1 && col.rows[0].data_type === "jsonb" &&
      String(col.rows[0].column_default).includes("'{}'"),
    col.rows[0] ? `${col.rows[0].data_type} default ${col.rows[0].column_default}` : "(missing)",
  );

  // 8. Migration recorded in the ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260519130000_super_admin_v6.sql"],
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
    ? "\nD-606 verify: ALL CHECKS PASS"
    : `\nD-606 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
