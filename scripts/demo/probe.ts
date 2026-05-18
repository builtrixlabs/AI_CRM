/* eslint-disable no-console */
/**
 * Probe Supabase to surface the current state relevant to demo sign-in:
 *   - applied migrations
 *   - organizations + suspension state
 *   - auth.users count + which demo emails exist
 *   - profiles + user_app_roles for demo emails
 *
 * Read-only. Does not write anything.
 *
 * Run with: `npx tsx scripts/demo/probe.ts`
 */
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAILS = [
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

const DEMO_ORG_SLUGS = [
  "skyline-realty-demo",
  "horizon-estates-demo",
  "coastal-properties-demo",
];

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (read from .env.local)"
    );
  }
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n[probe] target=${url}\n`);

  // 1. Applied migrations (supabase_migrations.schema_migrations)
  console.log("── Applied migrations (latest 10) ──");
  const { data: migrations, error: mErr } = await c
    .schema("supabase_migrations" as never)
    .from("schema_migrations")
    .select("version, name, statements")
    .order("version", { ascending: false })
    .limit(10);
  if (mErr) {
    console.log(`  (cannot read supabase_migrations.schema_migrations: ${mErr.message})`);
  } else if (!migrations || migrations.length === 0) {
    console.log("  (no rows)");
  } else {
    for (const m of migrations as Array<{ version: string; name: string | null }>) {
      console.log(`  ${m.version}  ${m.name ?? ""}`);
    }
  }

  // 2. Probe each recent-migration table/function — surfaces what's missing
  console.log("\n── Recent migrations probe ──");
  const probes: Array<{ migration: string; table?: string; rpc?: { name: string; args: Record<string, unknown> } }> = [
    { migration: "20260510120000_profiles_mfa_secret", table: "profiles" }, // can't introspect new column easily; use rpc/check
    { migration: "20260510120100_org_session_revocations", table: "org_session_revocations" },
    { migration: "20260510120200_subscription_plans_and_stripe", table: "subscription_plans" },
    { migration: "20260510120300_webhook_delivery_real", table: "webhook_deliveries" },
    { migration: "20260510120400_audit_retention_and_prune", table: "audit_log_retention_config" },
    { migration: "20260510120500_agent_approval_queue", table: "agent_approval_queue" },
  ];
  for (const p of probes) {
    if (p.table) {
      const { error } = await c.from(p.table).select("*").limit(0);
      console.log(`  ${error ? "MISSING" : "OK     "}  ${p.migration}  (table=${p.table}${error ? ` :: ${error.message.slice(0, 70)}` : ""})`);
    }
  }
  // RPC probe for app_is_org_revoked
  const probeOrgId = "00000000-0000-0000-0000-000000000000";
  const { error: rpcErr } = await c.rpc("app_is_org_revoked", { org_id: probeOrgId });
  console.log(`  ${rpcErr ? "MISSING" : "OK     "}  RPC app_is_org_revoked${rpcErr ? ` :: ${rpcErr.message.slice(0, 70)}` : ""}`);

  // 3. Demo orgs
  console.log("\n── Demo organizations ──");
  const { data: orgs, error: oErr } = await c
    .from("organizations")
    .select("id, slug, name, plan_tier, deleted_at")
    .in("slug", DEMO_ORG_SLUGS);
  if (oErr) console.log(`  ERROR: ${oErr.message}`);
  else {
    for (const slug of DEMO_ORG_SLUGS) {
      const found = (orgs ?? []).find(
        (o) => (o as { slug: string }).slug === slug
      );
      console.log(`  ${slug.padEnd(28)} ${found ? "EXISTS  id=" + (found as { id: string }).id : "MISSING"}`);
    }
  }

  // 4. auth.users + profiles for demo emails (uses admin API for auth.users)
  console.log("\n── Demo users (auth.users + profiles + app_roles) ──");
  const { data: usersResp, error: uErr } = await c.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  if (uErr) {
    console.log(`  auth.admin.listUsers error: ${uErr.message}`);
  } else {
    const allAuthUsers = usersResp?.users ?? [];
    const byEmail = new Map(
      allAuthUsers
        .filter((u) => !!u.email)
        .map((u) => [u.email!.toLowerCase(), u.id])
    );

    const { data: profiles } = await c
      .from("profiles")
      .select("id, email, base_role, organization_id")
      .in("email", DEMO_EMAILS);

    const profileById = new Map(
      (profiles ?? []).map((p) => [
        (p as { id: string }).id,
        p as { email: string; base_role: string; organization_id: string | null },
      ])
    );

    for (const email of DEMO_EMAILS) {
      const authId = byEmail.get(email.toLowerCase());
      const prof = authId ? profileById.get(authId) : null;
      const tag = !authId
        ? "NO auth.users"
        : !prof
          ? `auth.users=${authId.slice(0, 8)}..  NO profile`
          : `auth=${authId.slice(0, 8)}..  base_role=${prof.base_role}`;
      console.log(`  ${email.padEnd(38)} ${tag}`);
    }
  }

  console.log("\n[probe] done.\n");
}

main().catch((err) => {
  console.error("[probe] FAILED", err);
  process.exit(1);
});
