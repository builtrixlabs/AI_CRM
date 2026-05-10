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
  // V3.0 D-300 MFA columns (profiles.mfa_secret/mfa_recovery_codes/mfa_enrolled_at)
  // — required by lib/auth/getCurrentUser.ts. Was missing from PR #48 list.
  "supabase/migrations/20260510120000_profiles_mfa_secret.sql",
  // V3.0 D-209 — profiles.mfa_verified_at
  "supabase/migrations/20260509220000_profiles_mfa_verified_at.sql",
  // V3.0 (PR #48 set — apply if not already on live)
  "supabase/migrations/20260510120100_org_session_revocations.sql",
  "supabase/migrations/20260510120200_subscription_plans_and_stripe.sql",
  "supabase/migrations/20260510120300_webhook_delivery_real.sql",
  // 20260510120400_audit_retention_and_prune.sql is superseded by the
  // 20260510130500_fix_d312_prune_column_names.sql migration below, which
  // creates the corrected prune_* functions + ts indexes. The original V3.0
  // migration has wrong column names ('created_at' / 'received_at') and
  // will fail on apply. Skipping it here.
  "supabase/migrations/20260510120500_agent_approval_queue.sql",
  // V3.x (this v3 branch)
  "supabase/migrations/20260510130000_org_retention_overrides.sql",
  "supabase/migrations/20260510130100_webhook_secret_encryption.sql",
  "supabase/migrations/20260510130200_hard_delete_org.sql",
  "supabase/migrations/20260510130300_agent_token_budget.sql",
  "supabase/migrations/20260510130400_tier_aware_retention.sql",
  "supabase/migrations/20260510130500_fix_d312_prune_column_names.sql",
  "supabase/migrations/20260510130600_fix_retention_rpc_platform_flags.sql",
  "supabase/migrations/20260510130700_fix_d312_prune_webhook_deliveries.sql",
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
