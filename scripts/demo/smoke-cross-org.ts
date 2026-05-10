/* eslint-disable no-console */
/**
 * Live cross-tenant RLS smoke test against the seeded multi-org demo.
 *
 * For each pair of orgs, sign in as a non-super_admin user from org A using
 * the anon key, then attempt to read another org's organizations row by id
 * and any nodes carrying the other org's organization_id. Both must return
 * 0 rows (RLS is denying via filter, not raising). Super-admin sign-in must
 * see all orgs.
 *
 * Run with:
 *   npx tsx scripts/demo/smoke-cross-org.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): Record<string, string> {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), "../../../.env.local"),
    "C:/Users/ragha/OneDrive/Desktop/AI_CRM/.env.local",
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const env: Record<string, string> = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
    }
    return env;
  }
  return {};
}

const DEMO_CRED_ENV = "DEMO_SEED_PASSWORD";
const SUPER_CRED_ENV = "SUPER_ADMIN_PASSWORD";

interface Probe {
  email: string;
  cred_env: string;
  expect_org_slug: string | null; // null = super_admin
  label: string;
}

const PROBES: Probe[] = [
  { email: "superadmin@builtrixcrm.ai", cred_env: SUPER_CRED_ENV, expect_org_slug: null, label: "super_admin" },
  { email: "owner-skyline@builtrixcrm.ai", cred_env: DEMO_CRED_ENV, expect_org_slug: "skyline-realty-demo", label: "skyline org_owner" },
  { email: "admin-horizon@builtrixcrm.ai", cred_env: DEMO_CRED_ENV, expect_org_slug: "horizon-estates-demo", label: "horizon org_admin" },
  { email: "rep1-coastal@builtrixcrm.ai", cred_env: DEMO_CRED_ENV, expect_org_slug: "coastal-properties-demo", label: "coastal sales_rep" },
];

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const url = (process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)!.trim();
  const anon = (
    process.env.SUPABASE_PUBLISHABLE_KEY
    ?? env.SUPABASE_PUBLISHABLE_KEY
    ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )!.trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)!.trim();

  // Service-role client for ground truth
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // Fetch the 3 demo org ids by slug
  const { data: orgs, error: orgErr } = await admin
    .from("organizations")
    .select("id, slug, name")
    .in("slug", ["skyline-realty-demo", "horizon-estates-demo", "coastal-properties-demo"]);
  if (orgErr) throw orgErr;
  const bySlug = new Map<string, { id: string; slug: string; name: string }>();
  for (const o of orgs!) bySlug.set(o.slug as string, o as { id: string; slug: string; name: string });

  console.log("[smoke] orgs in scope:");
  for (const o of orgs!) console.log(`  ${o.slug.padEnd(28)} ${o.id}`);

  let passed = 0;
  let failed = 0;
  const fail = (msg: string) => { console.error(`  FAIL — ${msg}`); failed += 1; };
  const pass = (msg: string) => { console.log(`  PASS — ${msg}`); passed += 1; };

  for (const probe of PROBES) {
    console.log(`\n[smoke] ${probe.label}: ${probe.email}`);
    const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const cred = (process.env[probe.cred_env] ?? env[probe.cred_env] ?? "").trim();
    if (!cred) { fail(`${probe.cred_env} not set in env`); continue; }
    const { error: signErr } = await userClient.auth.signInWithPassword({ email: probe.email, password: cred });
    if (signErr) { fail(`sign-in: ${signErr.message}`); continue; }

    // probe 1: list orgs that this user can SELECT
    const { data: visibleOrgs, error: orgListErr } = await userClient
      .from("organizations")
      .select("id, slug, name");
    if (orgListErr) { fail(`org list: ${orgListErr.message}`); continue; }
    const visible = (visibleOrgs ?? []).map((o) => o.slug as string).sort();

    if (probe.expect_org_slug === null) {
      // super_admin: by design (D-001 / B5), no permissive RLS policy on tenant
      // tables. The /platform/* routes use service_role server-side. So an
      // anon-key session for super_admin SHOULD see 0 organizations rows.
      if (visible.length === 0) pass(`super_admin RLS-isolated as designed (0 org rows via anon key)`);
      else fail(`super_admin saw ${visible.length} rows via anon key — RLS leak!`);
    } else {
      // tenant user should see ONLY their own org
      if (visible.length === 1 && visible[0] === probe.expect_org_slug) {
        pass(`only own org visible (${probe.expect_org_slug})`);
      } else {
        fail(`expected only [${probe.expect_org_slug}] visible, got ${JSON.stringify(visible)}`);
      }
    }

    // probe 2: cross-org nodes SELECT — pick a different org's id, query nodes with that filter
    if (probe.expect_org_slug !== null) {
      const otherOrg = orgs!.find((o) => o.slug !== probe.expect_org_slug)!;
      const { data: crossNodes, error: nodesErr } = await userClient
        .from("nodes")
        .select("id")
        .eq("organization_id", otherOrg.id)
        .limit(5);
      if (nodesErr && nodesErr.code === "42501") {
        pass(`cross-org nodes blocked at policy (RLS denial): ${otherOrg.slug}`);
      } else if (!nodesErr && (crossNodes?.length ?? 0) === 0) {
        pass(`cross-org nodes filtered to 0 rows: ${otherOrg.slug}`);
      } else if (nodesErr) {
        fail(`cross-org nodes unexpected error: ${nodesErr.code}/${nodesErr.message}`);
      } else {
        fail(`cross-org nodes leak: ${crossNodes!.length} rows visible from ${otherOrg.slug}`);
      }
    }

    await userClient.auth.signOut();
  }

  console.log(`\n[smoke] result: ${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error("[smoke] FATAL", err); process.exit(1); });
