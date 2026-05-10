/* eslint-disable no-console */
/**
 * Verify sign-in for every demo account by mirroring what the app's
 * /api/auth/whoami → getCurrentUser does:
 *
 *   1. Sign in via password (anon-key client). Confirms the auth.users
 *      password hash matches.
 *   2. With the resulting access token, fetch the profile row.
 *   3. If profile.organization_id is non-null, call app_is_org_revoked
 *      RPC. Mirrors getCurrentUser's fail-closed check.
 *
 * Read-only.
 *
 * Run with: `npx tsx scripts/demo/verify-signin.ts`
 */
import { createClient } from "@supabase/supabase-js";

const ACCOUNTS = [
  { email: "superadmin@builtrixcrm.ai", expect_role: "super_admin" },
  { email: "owner-skyline@builtrixcrm.ai", expect_role: "org_owner" },
  { email: "admin-skyline@builtrixcrm.ai", expect_role: "org_admin" },
  { email: "manager-skyline@builtrixcrm.ai", expect_role: "manager" },
  { email: "rep1-skyline@builtrixcrm.ai", expect_role: "sales_rep" },
  { email: "cp-skyline@builtrixcrm.ai", expect_role: "channel_partner" },
  { email: "owner-horizon@builtrixcrm.ai", expect_role: "org_owner" },
  { email: "admin-horizon@builtrixcrm.ai", expect_role: "org_admin" },
  { email: "wsadmin-horizon@builtrixcrm.ai", expect_role: "workspace_admin" },
  { email: "rep1-horizon@builtrixcrm.ai", expect_role: "sales_rep" },
  { email: "owner-coastal@builtrixcrm.ai", expect_role: "org_owner" },
  { email: "rep1-coastal@builtrixcrm.ai", expect_role: "sales_rep" },
  { email: "viewer-coastal@builtrixcrm.ai", expect_role: "read_only" },
];

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const password = process.env.DEMO_PASSWORD?.trim();
  if (!url || !anon) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (read .env / .env.local)"
    );
  }
  if (!password) {
    throw new Error(
      "DEMO_PASSWORD must be set in .env.local (the shared demo password)"
    );
  }

  console.log(`\n[verify] target=${url}\n`);

  let pass = 0;
  let fail = 0;

  for (const a of ACCOUNTS) {
    // Use a fresh client per account so cookies/sessions don't leak.
    const c = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    process.stdout.write(`  ${a.email.padEnd(38)} `);

    const { data: signIn, error: signInErr } = await c.auth.signInWithPassword({
      email: a.email,
      password,
    });
    if (signInErr || !signIn?.user) {
      console.log(`FAIL  signInWithPassword: ${signInErr?.message ?? "no user"}`);
      fail++;
      continue;
    }

    const userId = signIn.user.id;

    // Mirror getCurrentUser: fetch profile.
    const { data: profile, error: profileErr } = await c
      .from("profiles")
      .select("id, base_role, organization_id")
      .eq("id", userId)
      .single();
    if (profileErr || !profile) {
      console.log(`FAIL  no profile: ${profileErr?.message ?? "no row"}`);
      fail++;
      await c.auth.signOut();
      continue;
    }

    // Mirror getCurrentUser revocation check.
    if ((profile as { organization_id: string | null }).organization_id) {
      const { data: revoked, error: revokedErr } = await c.rpc(
        "app_is_org_revoked",
        { org_id: (profile as { organization_id: string }).organization_id }
      );
      if (revokedErr) {
        console.log(`FAIL  app_is_org_revoked rpc error: ${revokedErr.message}`);
        fail++;
        await c.auth.signOut();
        continue;
      }
      if (revoked === true) {
        console.log("FAIL  org is currently revoked (in org_session_revocations)");
        fail++;
        await c.auth.signOut();
        continue;
      }
    }

    const roleMatch =
      (profile as { base_role: string }).base_role === a.expect_role
        ? "OK"
        : `WRONG_ROLE(actual=${(profile as { base_role: string }).base_role})`;
    console.log(
      `${roleMatch === "OK" ? "PASS" : "FAIL"}  base_role=${(profile as { base_role: string }).base_role}`
    );
    if (roleMatch === "OK") pass++;
    else fail++;
    await c.auth.signOut();
  }

  console.log(`\n[verify] done · pass=${pass} fail=${fail}\n`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[verify] FATAL", err);
  process.exit(1);
});
