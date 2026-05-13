import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const checks = [
  { name: 'org_sms_config table exists', sql: `SELECT to_regclass('public.org_sms_config') IS NOT NULL AS ok` },
  { name: 'org_sms_config has organization_id PK', sql: `SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.org_sms_config'::regclass AND contype='p') AS ok` },
  {
    name: 'provider CHECK includes msg91 + gupshup',
    sql: `SELECT bool_or(pg_get_constraintdef(oid) ~ 'msg91' AND pg_get_constraintdef(oid) ~ 'gupshup') AS ok
          FROM pg_constraint WHERE conrelid='public.org_sms_config'::regclass AND contype='c'`,
  },
  { name: 'org_sms_config RLS enabled', sql: `SELECT relrowsecurity AS ok FROM pg_class WHERE oid='public.org_sms_config'::regclass` },
  { name: 'org_sms_config SELECT policy present', sql: `SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='org_sms_config' AND cmd='SELECT') AS ok` },
  { name: 'no INSERT/UPDATE/DELETE policies on org_sms_config', sql: `SELECT (count(*) = 0) AS ok FROM pg_policies WHERE schemaname='public' AND tablename='org_sms_config' AND cmd IN ('INSERT','UPDATE','DELETE')` },
  { name: 'org_sms_config_redacted view exists', sql: `SELECT to_regclass('public.org_sms_config_redacted') IS NOT NULL AS ok` },
  { name: 'org_sms_config_redacted has SELECT grant to authenticated', sql: `SELECT EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='org_sms_config_redacted' AND grantee='authenticated' AND privilege_type='SELECT') AS ok` },
  { name: 'dlt_templates table exists', sql: `SELECT to_regclass('public.dlt_templates') IS NOT NULL AS ok` },
  {
    name: 'dlt_templates has (organization_id, template_id) PK',
    sql: `SELECT EXISTS(
            SELECT 1 FROM pg_constraint
             WHERE conrelid='public.dlt_templates'::regclass
               AND contype='p'
               AND array_length(conkey, 1) = 2
          ) AS ok`,
  },
  { name: 'dlt_templates RLS enabled', sql: `SELECT relrowsecurity AS ok FROM pg_class WHERE oid='public.dlt_templates'::regclass` },
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
