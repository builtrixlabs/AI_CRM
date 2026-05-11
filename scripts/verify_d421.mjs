import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const checks = [
  { name: 'deal_stage enum exists', sql: `SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname='deal_stage') AS ok` },
  { name: 'deal_stage has 8 values', sql: `SELECT (count(*) = 8) AS ok FROM pg_enum WHERE enumtypid = 'deal_stage'::regtype` },
  { name: 'deal_stage values in canonical order', sql: `SELECT array_agg(enumlabel::text ORDER BY enumsortorder) = ARRAY['eoi','token','booking','sale_agreement','loan_finance','registration','possession','handover_complete']::text[] AS ok FROM pg_enum WHERE enumtypid='deal_stage'::regtype` },
  { name: 'nodes.current_stage column exists', sql: `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nodes' AND column_name='current_stage') AS ok` },
  { name: 'stage_transitions table exists', sql: `SELECT to_regclass('public.stage_transitions') IS NOT NULL AS ok` },
  { name: 'stage_transitions index on (org,deal,occurred_at)', sql: `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='stage_transitions' AND indexname='stage_transitions_org_deal_time_idx') AS ok` },
  { name: 'stage_transitions UNIQUE (deal_id, idempotency_key)', sql: `SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname LIKE 'stage_transitions_deal_id_idempotency_key%' AND contype='u') AS ok` },
  { name: 'stage_transitions RLS enabled', sql: `SELECT relrowsecurity AS ok FROM pg_class WHERE oid='public.stage_transitions'::regclass` },
  { name: 'stage_transitions SELECT policy present', sql: `SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stage_transitions' AND cmd='SELECT') AS ok` },
  { name: 'stage_transitions no INSERT/UPDATE/DELETE policies (RPC-only)', sql: `SELECT (count(*) = 0) AS ok FROM pg_policies WHERE schemaname='public' AND tablename='stage_transitions' AND cmd IN ('INSERT','UPDATE','DELETE')` },
  { name: 'transition_stage function exists', sql: `SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='transition_stage' AND pronamespace='public'::regnamespace) AS ok` },
  { name: 'transition_stage is SECURITY DEFINER', sql: `SELECT bool_or(prosecdef) AS ok FROM pg_proc WHERE proname='transition_stage' AND pronamespace='public'::regnamespace` },
  { name: 'transition_stage EXECUTE granted to authenticated', sql: `SELECT EXISTS(SELECT 1 FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name='transition_stage' AND grantee='authenticated' AND privilege_type='EXECUTE') AS ok` },
  { name: 'backfill: all deal nodes have current_stage populated', sql: `SELECT (count(*) FILTER (WHERE current_stage IS NULL) = 0) AS ok FROM nodes WHERE node_type='deal' AND deleted_at IS NULL` },
  { name: 'backfill: one stage_transitions row per existing deal', sql: `SELECT ((SELECT count(*) FROM nodes WHERE node_type='deal' AND deleted_at IS NULL) = (SELECT count(*) FROM stage_transitions WHERE triggered_by='migration:20260511220000')) AS ok` },
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
console.log(`\n${pass}/${pass+fail} checks pass`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
