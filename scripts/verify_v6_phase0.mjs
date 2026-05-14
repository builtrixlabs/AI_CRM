/**
 * V6 Phase 0 verification — confirms the stabilization migration
 * `20260514120000_v6_narrow_sister_product_kind.sql` applied correctly.
 *
 * Run from the repo root with DATABASE_URL available, e.g.:
 *   node --env-file=.env scripts/verify_v6_phase0.mjs
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
  // 1. org_sister_product_tokens table still exists (DORMANT, not dropped).
  const tbl = await c.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_sister_product_tokens'
  `);
  check("org_sister_product_tokens table exists", tbl.rowCount === 1);

  // 2. product_kind CHECK constraint exists and is MIH-only.
  const con = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.org_sister_product_tokens'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%product_kind%'
  `);
  const def = con.rows[0]?.def ?? "";
  check("product_kind CHECK constraint exists", con.rowCount === 1, con.rows[0]?.conname);
  check(
    "CHECK allows marketing_intelligence_hub",
    def.includes("marketing_intelligence_hub"),
    def,
  );
  check(
    "CHECK no longer allows post_sales_crm / lead_sources / legal_auditor",
    !def.includes("post_sales_crm") &&
      !def.includes("lead_sources") &&
      !def.includes("legal_auditor"),
    def,
  );

  // 3. RLS still enabled on the table.
  const rls = await c.query(`
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.org_sister_product_tokens'::regclass
  `);
  check(
    "RLS still enabled on org_sister_product_tokens",
    rls.rows[0]?.relrowsecurity === true,
  );

  // 4. No surviving token rows violate the new constraint.
  const rows = await c.query(`
    SELECT product_kind, count(*)::int AS n
    FROM public.org_sister_product_tokens
    GROUP BY product_kind
  `);
  const nonMih = rows.rows.filter(
    (r) => r.product_kind !== "marketing_intelligence_hub",
  );
  check(
    "no surviving non-MIH token rows",
    nonMih.length === 0,
    rows.rows.map((r) => `${r.product_kind}=${r.n}`).join(", ") || "(table empty)",
  );

  // 5. Migration recorded in the idempotency ledger.
  const led = await c.query(
    `SELECT 1 FROM public.applied_migrations WHERE name = $1`,
    ["20260514120000_v6_narrow_sister_product_kind.sql"],
  );
  check("migration recorded in applied_migrations ledger", led.rowCount === 1);

  // 6. Revival-path tables retained — catalog/inventory/booking are NOT dropped.
  const retained = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('nodes', 'stage_transitions', 'directives', 'directive_invocations')
  `);
  const retainedSet = new Set(retained.rows.map((r) => r.table_name));
  check(
    "revival-path tables retained (nodes, stage_transitions, directives)",
    retainedSet.has("nodes") &&
      retainedSet.has("stage_transitions") &&
      retainedSet.has("directives"),
    [...retainedSet].join(", "),
  );
} catch (e) {
  console.error("verify FAILED with error:", e.message);
  failures += 1;
} finally {
  await c.end();
}

console.log(
  failures === 0
    ? "\nV6 Phase 0 verify: ALL CHECKS PASS"
    : `\nV6 Phase 0 verify: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
