import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const checks = [
  {
    name: 'org_whatsapp_endpoints.provider column exists with CHECK',
    sql: `SELECT EXISTS(
            SELECT 1 FROM information_schema.columns
             WHERE table_schema='public'
               AND table_name='org_whatsapp_endpoints'
               AND column_name='provider'
          ) AS ok`,
  },
  {
    name: 'provider CHECK includes gupshup + cloud_api',
    sql: `SELECT bool_or(
              pg_get_constraintdef(oid) ~ 'gupshup'
              AND pg_get_constraintdef(oid) ~ 'cloud_api'
            ) AS ok
          FROM pg_constraint
         WHERE conrelid='public.org_whatsapp_endpoints'::regclass
           AND contype='c'`,
  },
  {
    name: 'encrypted_credentials column exists',
    sql: `SELECT EXISTS(
            SELECT 1 FROM information_schema.columns
             WHERE table_schema='public'
               AND table_name='org_whatsapp_endpoints'
               AND column_name='encrypted_credentials'
          ) AS ok`,
  },
  {
    name: 'approved_template_ids text[] column exists',
    sql: `SELECT EXISTS(
            SELECT 1 FROM information_schema.columns
             WHERE table_schema='public'
               AND table_name='org_whatsapp_endpoints'
               AND column_name='approved_template_ids'
          ) AS ok`,
  },
  {
    name: 'from_phone_number_id column exists',
    sql: `SELECT EXISTS(
            SELECT 1 FROM information_schema.columns
             WHERE table_schema='public'
               AND table_name='org_whatsapp_endpoints'
               AND column_name='from_phone_number_id'
          ) AS ok`,
  },
  {
    name: 'from_display_number column exists',
    sql: `SELECT EXISTS(
            SELECT 1 FROM information_schema.columns
             WHERE table_schema='public'
               AND table_name='org_whatsapp_endpoints'
               AND column_name='from_display_number'
          ) AS ok`,
  },
  {
    name: 'test_ping_* columns exist',
    sql: `SELECT (count(*) = 3) AS ok
            FROM information_schema.columns
           WHERE table_schema='public'
             AND table_name='org_whatsapp_endpoints'
             AND column_name IN ('test_ping_at','test_ping_ok','test_ping_message')`,
  },
  {
    name: 'org_whatsapp_endpoints_redacted view exists',
    sql: `SELECT to_regclass('public.org_whatsapp_endpoints_redacted') IS NOT NULL AS ok`,
  },
  {
    name: 'redacted view has SELECT grant to authenticated',
    sql: `SELECT EXISTS(
            SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public'
               AND table_name='org_whatsapp_endpoints_redacted'
               AND grantee='authenticated'
               AND privilege_type='SELECT'
          ) AS ok`,
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
