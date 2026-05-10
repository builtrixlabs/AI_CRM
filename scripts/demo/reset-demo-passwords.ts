/* eslint-disable no-console */
/**
 * Reset the password for every demo account to the shared demo password
 * documented in scripts/demo/verify-signin.ts. Uses supabase admin API.
 *
 * Idempotent — re-running just re-sets the same password.
 *
 * Run with: `npx tsx scripts/demo/reset-demo-passwords.ts`
 */
import { createClient } from "@supabase/supabase-js";

const ACCOUNTS = [
  "superadmin@builtrixcrm.ai",
  "owner-skyline@builtrixcrm.ai",
  "admin-skyline@builtrixcrm.ai",
  "manager-skyline@builtrixcrm.ai",
  "rep1-skyline@builtrixcrm.ai",
  "cp-skyline@builtrixcrm.ai",
  "owner-horizon@builtrixcrm.ai",
  "admin-horizon@builtrixcrm.ai",
  "wsadmin-horizon@builtrixcrm.ai",
  "rep1-horizon@builtrixcrm.ai",
  "owner-coastal@builtrixcrm.ai",
  "rep1-coastal@builtrixcrm.ai",
  "viewer-coastal@builtrixcrm.ai",
];

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const password = process.env.DEMO_PASSWORD?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (read from .env.local)"
    );
  }
  if (!password) {
    throw new Error(
      "DEMO_PASSWORD must be set in .env.local (the shared demo password)"
    );
  }
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usersResp, error: listErr } = await c.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  if (listErr) throw listErr;
  const byEmail = new Map(
    (usersResp?.users ?? [])
      .filter((u) => !!u.email)
      .map((u) => [u.email!.toLowerCase(), u])
  );

  let ok = 0;
  let missing = 0;
  let failed = 0;

  for (const email of ACCOUNTS) {
    const u = byEmail.get(email.toLowerCase());
    if (!u) {
      console.log(`  ${email.padEnd(38)} MISSING`);
      missing++;
      continue;
    }
    const { error } = await c.auth.admin.updateUserById(u.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.log(`  ${email.padEnd(38)} FAIL  ${error.message}`);
      failed++;
    } else {
      console.log(`  ${email.padEnd(38)} OK`);
      ok++;
    }
  }

  console.log(`\n[reset] done · ok=${ok} missing=${missing} failed=${failed}\n`);
  if (failed > 0 || missing > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[reset] FATAL", err);
  process.exit(1);
});
