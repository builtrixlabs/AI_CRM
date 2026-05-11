import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const checks = [
  { name: 'custom_views table', sql: `SELECT to_regclass('public.custom_views') IS NOT NULL AS ok` },
  { name: 'profiles.view_defaults column', sql: `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='view_defaults') AS ok` },
  { name: 'set_view_default RPC', sql: `SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='set_view_default') AS ok` },
  { name: 'custom_views RLS enabled', sql: `SELECT relrowsecurity AS ok FROM pg_class WHERE oid='public.custom_views'::regclass` },
  { name: 'custom_views policies count >= 3', sql: `SELECT (count(*) >= 3) AS ok FROM pg_policies WHERE schemaname='public' AND tablename='custom_views'` },
  { name: 'custom_views unique org-slug index', sql: `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='custom_views' AND indexname='custom_views_org_slug_uq') AS ok` },
  { name: 'custom_views_lock_scope_owner trigger', sql: `SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='custom_views_lock_scope_owner_trg') AS ok` },
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
