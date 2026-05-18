/* eslint-disable no-console */
/**
 * Apply specific pending migrations to the linked Supabase project via direct
 * pg connection. Each migration runs in its own transaction. Idempotency is
 * delegated to the migration SQL itself (the v3 migrations use IF NOT EXISTS
 * for tables and CREATE OR REPLACE for functions; CREATE POLICY is bare —
 * if a policy already exists from a partial earlier run, the migration that
 * creates it will fail, the txn rolls back, and the operator can decide).
 *
 * Run with: `npx tsx scripts/demo/apply-pending-migrations.ts`
 *
 * Required env: DATABASE_URL  (Supabase Pooler/Direct URL).
 *
 * After this lands, also re-run `scripts/demo/probe.ts` to confirm.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PENDING = [
  "supabase/migrations/20260510120100_org_session_revocations.sql",
  "supabase/migrations/20260510120200_subscription_plans_and_stripe.sql",
  "supabase/migrations/20260510120400_audit_retention_and_prune.sql",
  "supabase/migrations/20260510120500_agent_approval_queue.sql",
];

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL must be set");

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`[apply] connected to ${url.replace(/:[^@]*@/, ":****@")}`);

  let appliedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const rel of PENDING) {
    const path = resolve(process.cwd(), rel);
    const sql = readFileSync(path, "utf-8");
    const name = rel.split("/").pop()!.replace(/\.sql$/, "");
    process.stdout.write(`\n[apply] ${name} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log("OK");
      appliedCount++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      const msg = (err as Error).message ?? String(err);
      // Treat "already exists" as skip-not-fail (partial earlier apply).
      if (/already exists/i.test(msg)) {
        console.log(`SKIP (${msg.slice(0, 100)})`);
        skippedCount++;
      } else {
        console.log(`FAIL\n  ${msg}`);
        failedCount++;
      }
    }
  }

  await client.end();
  console.log(
    `\n[apply] done · applied=${appliedCount} skipped=${skippedCount} failed=${failedCount}`
  );
  if (failedCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[apply] FATAL", err);
  process.exit(1);
});
