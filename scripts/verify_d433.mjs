import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const checks = [
  {
    name: 'org_telephony_config table exists',
    sql: `SELECT to_regclass('public.org_telephony_config') IS NOT NULL AS ok`,
  },
  {
    name: 'org_telephony_config has organization_id PK',
    sql: `SELECT EXISTS(
            SELECT 1 FROM pg_constraint
             WHERE conrelid='public.org_telephony_config'::regclass
               AND contype='p'
          ) AS ok`,
  },
  {
    name: 'provider CHECK includes exotel + 4 alternates',
    sql: `SELECT bool_or(
              pg_get_constraintdef(oid) ~ 'exotel'
              AND pg_get_constraintdef(oid) ~ 'servetel'
              AND pg_get_constraintdef(oid) ~ 'knowlarity'
              AND pg_get_constraintdef(oid) ~ 'myoperator'
              AND pg_get_constraintdef(oid) ~ 'ozonetel'
            ) AS ok
          FROM pg_constraint
         WHERE conrelid='public.org_telephony_config'::regclass
           AND contype='c'`,
  },
  {
    name: 'org_telephony_config RLS enabled',
    sql: `SELECT relrowsecurity AS ok
            FROM pg_class
           WHERE oid='public.org_telephony_config'::regclass`,
  },
  {
    name: 'SELECT policy present',
    sql: `SELECT EXISTS(
            SELECT 1 FROM pg_policies
             WHERE schemaname='public'
               AND tablename='org_telephony_config'
               AND cmd='SELECT'
          ) AS ok`,
  },
  {
    name: 'no INSERT/UPDATE/DELETE policies (service-role-only writes)',
    sql: `SELECT (count(*) = 0) AS ok
            FROM pg_policies
           WHERE schemaname='public'
             AND tablename='org_telephony_config'
             AND cmd IN ('INSERT','UPDATE','DELETE')`,
  },
  {
    name: 'redacted view exists',
    sql: `SELECT to_regclass('public.org_telephony_config_redacted') IS NOT NULL AS ok`,
  },
  {
    name: 'redacted view has SELECT grant to authenticated',
    sql: `SELECT EXISTS(
            SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public'
               AND table_name='org_telephony_config_redacted'
               AND grantee='authenticated'
               AND privilege_type='SELECT'
          ) AS ok`,
  },
];

let pass = 0,
  fail = 0;
for (const k of checks) {
  try {
    const r = await c.query(k.sql);
    const ok = r.rows[0]?.ok === true;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${k.name}`);
    if (ok) pass++;
    else fail++;
  } catch (e) {
    console.log(`FAIL  ${k.name}  (${e.message})`);
    fail++;
  }
}
console.log(`\n${pass}/${pass + fail} checks pass`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
