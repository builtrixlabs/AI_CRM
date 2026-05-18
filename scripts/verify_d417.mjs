import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const checks = [
  { name: 'webform_endpoints table', sql: `SELECT to_regclass('public.webform_endpoints') IS NOT NULL AS ok` },
  { name: 'leads_quarantine table', sql: `SELECT to_regclass('public.leads_quarantine') IS NOT NULL AS ok` },
  { name: 'webform_endpoints token_hash unique', sql: `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='webform_endpoints' AND indexdef LIKE '%token_hash%') AS ok` },
  { name: 'webform_endpoints RLS enabled', sql: `SELECT relrowsecurity AS ok FROM pg_class WHERE oid='public.webform_endpoints'::regclass` },
  { name: 'leads_quarantine RLS enabled', sql: `SELECT relrowsecurity AS ok FROM pg_class WHERE oid='public.leads_quarantine'::regclass` },
  { name: 'webform_endpoints policies >= 3', sql: `SELECT (count(*) >= 3) AS ok FROM pg_policies WHERE schemaname='public' AND tablename='webform_endpoints'` },
  { name: 'pgcrypto extension installed', sql: `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto') AS ok` },
];
let pass = 0, fail = 0;
for (const k of checks) {
  const r = await c.query(k.sql);
  const ok = r.rows[0]?.ok === true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${k.name}`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass}/${pass+fail} checks pass`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
