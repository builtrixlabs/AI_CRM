import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const checks = [
  {
    name: 'org_sister_product_tokens table exists',
    sql: `SELECT to_regclass('public.org_sister_product_tokens') IS NOT NULL AS ok`,
  },
  {
    name: 'product_kind CHECK includes the 3 known products',
    sql: `SELECT bool_or(
              pg_get_constraintdef(oid) ~ 'post_sales_crm'
              AND pg_get_constraintdef(oid) ~ 'lead_sources'
              AND pg_get_constraintdef(oid) ~ 'legal_auditor'
            ) AS ok
          FROM pg_constraint
         WHERE conrelid='public.org_sister_product_tokens'::regclass
           AND contype='c'`,
  },
  {
    name: 'token_hash UNIQUE constraint present',
    sql: `SELECT EXISTS(
            SELECT 1 FROM pg_constraint
             WHERE conrelid='public.org_sister_product_tokens'::regclass
               AND contype='u'
          ) AS ok`,
  },
  {
    name: 'active token_hash partial index exists',
    sql: `SELECT EXISTS(
            SELECT 1 FROM pg_indexes
             WHERE schemaname='public'
               AND tablename='org_sister_product_tokens'
               AND indexname='org_sister_product_tokens_active_hash_idx'
          ) AS ok`,
  },
  {
    name: 'org_sister_product_tokens RLS enabled',
    sql: `SELECT relrowsecurity AS ok
            FROM pg_class
           WHERE oid='public.org_sister_product_tokens'::regclass`,
  },
  {
    name: 'super_admin-only SELECT policy present',
    sql: `SELECT EXISTS(
            SELECT 1 FROM pg_policies
             WHERE schemaname='public'
               AND tablename='org_sister_product_tokens'
               AND cmd='SELECT'
               AND qual LIKE '%app_is_super_admin%'
          ) AS ok`,
  },
  {
    name: 'no INSERT/UPDATE/DELETE policies (service-role-only writes)',
    sql: `SELECT (count(*) = 0) AS ok
            FROM pg_policies
           WHERE schemaname='public'
             AND tablename='org_sister_product_tokens'
             AND cmd IN ('INSERT','UPDATE','DELETE')`,
  },
];

let pass = 0, fail = 0;
for (const k of checks) {
  try {
    const r = await c.query(k.sql);
    const ok = r.rows[0]?.ok === true;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${k.name}`);
    if (ok) pass++; else fail++;
  } catch (e) {
    console.log(`FAIL  ${k.name}  (${e.message})`);
    fail++;
  }
}
console.log(`\n${pass}/${pass + fail} checks pass`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
