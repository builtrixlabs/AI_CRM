import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }
const migrationPath = process.argv[2];
if (!migrationPath) { console.error('usage: node apply_migration.mjs <path>'); process.exit(1); }

const sql = readFileSync(migrationPath, 'utf8');
const migrationName = migrationPath.split(/[\/]/).pop();

const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  // Track applied migrations idempotently in a meta table.
  await c.query(`CREATE TABLE IF NOT EXISTS public.applied_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), sha text)`);
  const exists = await c.query('SELECT 1 FROM public.applied_migrations WHERE name=$1', [migrationName]);
  if (exists.rowCount > 0) {
    console.log(`SKIPPED ${migrationName} — already applied`);
    process.exit(0);
  }
  // Use a transaction so partial failures roll back.
  await c.query('BEGIN');
  await c.query(sql);
  await c.query('INSERT INTO public.applied_migrations(name) VALUES ($1)', [migrationName]);
  await c.query('COMMIT');
  console.log(`APPLIED ${migrationName}`);
} catch (e) {
  await c.query('ROLLBACK').catch(()=>{});
  console.error(`FAILED ${migrationName}:`, e.message);
  process.exit(2);
} finally {
  await c.end();
}
