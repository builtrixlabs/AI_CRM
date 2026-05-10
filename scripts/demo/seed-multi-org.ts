/* eslint-disable no-console */
/**
 * Multi-org / multi-role seed for QA + demo logins.
 *
 * Creates 3 orgs (Skyline Realty already exists from demo:seed; this script
 * attaches users to it) and 13 users covering every base_role except
 * service_account. All users get the same password so the operator can pick
 * any role and sign in.
 *
 * Idempotent: re-running upserts orgs/workspaces/teams and treats existing
 * auth users as no-op (profile + bridge rows still inserted with ON CONFLICT).
 *
 * Run with:
 *   npx tsx scripts/demo/seed-multi-org.ts
 *
 * Required env (read from .env.local at repo root by tsx automatically when
 * the file lives next to package.json — but tsx doesn't auto-load, so we
 * read manually):
 *   SUPABASE_URL                — https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key
 *
 * The seed credential is read from the env variable named below
 * (DEMO_SEED_PASSWORD). Set it in .env.local.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Demo seed credential. Must be set in env (e.g. .env.local) so the literal
// never appears in source. Operator default is documented in the runbook.
const SEED_CRED_ENV = "DEMO_SEED_PASSWORD";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

type AppRole =
  | "org_owner"
  | "org_admin"
  | "workspace_admin"
  | "manager"
  | "sales_rep"
  | "read_only"
  | "channel_partner";

type BaseRole = AppRole | "super_admin" | "service_account";

interface SeedOrg {
  slug: string;
  name: string;
  plan_tier: "starter" | "professional" | "enterprise";
  rera_number?: string;
  gstin?: string;
  primary_contact_email: string;
  workspace_slug: string;
  team_name: string;
}

interface SeedUser {
  email: string;
  display_name: string;
  base_role: BaseRole;
  app_role: AppRole;
  org_slug: string;
}

const ORGS: SeedOrg[] = [
  {
    slug: "skyline-realty-demo",
    name: "Skyline Realty Pvt Ltd",
    plan_tier: "professional",
    rera_number: "PRM/KA/RERA/1251/308/PR/200405/001234",
    gstin: "29AAACS1234A1Z5",
    primary_contact_email: "owner-skyline@builtrixcrm.ai",
    workspace_slug: "default",
    team_name: "Inside Sales",
  },
  {
    slug: "horizon-estates-demo",
    name: "Horizon Estates Pvt Ltd",
    plan_tier: "professional",
    rera_number: "P51800012345",
    gstin: "27AAACH9876B2Z3",
    primary_contact_email: "owner-horizon@builtrixcrm.ai",
    workspace_slug: "mumbai-hq",
    team_name: "Western Region",
  },
  {
    slug: "coastal-properties-demo",
    name: "Coastal Properties LLP",
    plan_tier: "starter",
    rera_number: "GA/RERA/0078/2024",
    gstin: "30AAACC5678C3Z9",
    primary_contact_email: "owner-coastal@builtrixcrm.ai",
    workspace_slug: "goa-default",
    team_name: "Coastal Sales",
  },
];

const USERS: SeedUser[] = [
  // ── Skyline Realty (5) ──
  { email: "owner-skyline@builtrixcrm.ai", display_name: "Skyline Owner", base_role: "org_owner", app_role: "org_owner", org_slug: "skyline-realty-demo" },
  { email: "admin-skyline@builtrixcrm.ai", display_name: "Skyline Admin", base_role: "org_admin", app_role: "org_admin", org_slug: "skyline-realty-demo" },
  { email: "manager-skyline@builtrixcrm.ai", display_name: "Skyline Manager", base_role: "manager", app_role: "manager", org_slug: "skyline-realty-demo" },
  { email: "rep1-skyline@builtrixcrm.ai", display_name: "Skyline Rep 1", base_role: "sales_rep", app_role: "sales_rep", org_slug: "skyline-realty-demo" },
  { email: "cp-skyline@builtrixcrm.ai", display_name: "Skyline Channel Partner", base_role: "channel_partner", app_role: "channel_partner", org_slug: "skyline-realty-demo" },

  // ── Horizon Estates (4) ──
  { email: "owner-horizon@builtrixcrm.ai", display_name: "Horizon Owner", base_role: "org_owner", app_role: "org_owner", org_slug: "horizon-estates-demo" },
  { email: "admin-horizon@builtrixcrm.ai", display_name: "Horizon Admin", base_role: "org_admin", app_role: "org_admin", org_slug: "horizon-estates-demo" },
  { email: "wsadmin-horizon@builtrixcrm.ai", display_name: "Horizon Workspace Admin", base_role: "workspace_admin", app_role: "workspace_admin", org_slug: "horizon-estates-demo" },
  { email: "rep1-horizon@builtrixcrm.ai", display_name: "Horizon Rep 1", base_role: "sales_rep", app_role: "sales_rep", org_slug: "horizon-estates-demo" },

  // ── Coastal Properties (3) ──
  { email: "owner-coastal@builtrixcrm.ai", display_name: "Coastal Owner", base_role: "org_owner", app_role: "org_owner", org_slug: "coastal-properties-demo" },
  { email: "rep1-coastal@builtrixcrm.ai", display_name: "Coastal Rep 1", base_role: "sales_rep", app_role: "sales_rep", org_slug: "coastal-properties-demo" },
  { email: "viewer-coastal@builtrixcrm.ai", display_name: "Coastal Viewer", base_role: "read_only", app_role: "read_only", org_slug: "coastal-properties-demo" },
];

interface Counts {
  orgs_created: number;
  orgs_existing: number;
  workspaces_created: number;
  teams_created: number;
  auth_users_created: number;
  auth_users_existing: number;
  profiles_created: number;
  bridge_rows_created: number;
}

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
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
      env[key] = value;
    }
    console.log(`[seed] loaded env from ${path}`);
    return env;
  }
  return {};
}

function envOrThrow(env: Record<string, string>, name: string): string {
  const v = process.env[name] ?? env[name];
  if (!v) throw new Error(`${name} required (set in .env.local at repo root)`);
  return v;
}

async function adminListUsers(
  url: string,
  key: string,
  email: string,
): Promise<{ id: string } | null> {
  const res = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`admin/users GET failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { users?: Array<{ id: string; email: string }> };
  const match = (data.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match ? { id: match.id } : null;
}

async function adminCreateUser(
  url: string,
  key: string,
  email: string,
  password: string,
): Promise<{ id: string }> {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`admin/users POST failed for ${email} (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

async function adminSetPassword(
  url: string,
  key: string,
  user_id: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${url}/auth/v1/admin/users/${user_id}`, {
    method: "PUT",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`admin/users PUT failed (${res.status}): ${body}`);
  }
}

async function upsertOrg(
  client: SupabaseClient,
  org: SeedOrg,
  counts: Counts,
): Promise<string> {
  const { data: existing } = await client
    .from("organizations")
    .select("id")
    .eq("slug", org.slug)
    .maybeSingle();
  if (existing) {
    counts.orgs_existing += 1;
    return existing.id as string;
  }
  const { data, error } = await client
    .from("organizations")
    .insert({
      slug: org.slug,
      name: org.name,
      plan_tier: org.plan_tier,
      rera_number: org.rera_number ?? null,
      gstin: org.gstin ?? null,
      primary_contact_email: org.primary_contact_email,
      onboarding_state: {
        completed: true,
        current_step: "completed",
        completed_steps: ["org_details", "branding", "first_workspace", "team_users"],
      },
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (error) throw new Error(`organizations insert ${org.slug}: ${error.message}`);
  counts.orgs_created += 1;
  return data!.id as string;
}

async function upsertWorkspace(
  client: SupabaseClient,
  org_id: string,
  org: SeedOrg,
  counts: Counts,
): Promise<string> {
  const { data: existing } = await client
    .from("workspaces")
    .select("id")
    .eq("organization_id", org_id)
    .eq("slug", org.workspace_slug)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await client
    .from("workspaces")
    .insert({
      organization_id: org_id,
      slug: org.workspace_slug,
      name: org.workspace_slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (error) throw new Error(`workspaces insert ${org.slug}/${org.workspace_slug}: ${error.message}`);
  counts.workspaces_created += 1;
  return data!.id as string;
}

async function upsertTeam(
  client: SupabaseClient,
  org_id: string,
  ws_id: string,
  team_name: string,
  counts: Counts,
): Promise<void> {
  const { data: existing } = await client
    .from("teams")
    .select("id")
    .eq("workspace_id", ws_id)
    .eq("name", team_name)
    .maybeSingle();
  if (existing) return;
  const { error } = await client.from("teams").insert({
    organization_id: org_id,
    workspace_id: ws_id,
    name: team_name,
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
  if (error) throw new Error(`teams insert ${team_name}: ${error.message}`);
  counts.teams_created += 1;
}

async function upsertProfile(
  client: SupabaseClient,
  user_id: string,
  email: string,
  display_name: string,
  base_role: BaseRole,
  organization_id: string | null,
  counts: Counts,
): Promise<void> {
  const { data: existing } = await client
    .from("profiles")
    .select("id, base_role, organization_id")
    .eq("id", user_id)
    .maybeSingle();
  if (existing) return; // leave existing profile alone
  const { error } = await client.from("profiles").insert({
    id: user_id,
    organization_id,
    email,
    display_name,
    base_role,
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
  if (error) throw new Error(`profiles insert ${email}: ${error.message}`);
  counts.profiles_created += 1;
}

async function upsertUserAppRole(
  client: SupabaseClient,
  user_id: string,
  organization_id: string,
  workspace_id: string | null,
  app_role: AppRole,
  granted_by: string,
  counts: Counts,
): Promise<void> {
  // org-wide rows have workspace_id NULL — match on that explicitly
  let q = client
    .from("user_app_roles")
    .select("id")
    .eq("user_id", user_id)
    .eq("organization_id", organization_id)
    .eq("app_role", app_role)
    .eq("product_id", "crm");
  q = workspace_id === null ? q.is("workspace_id", null) : q.eq("workspace_id", workspace_id);
  const { data: existing } = await q.maybeSingle();
  if (existing) return;
  const { error } = await client.from("user_app_roles").insert({
    user_id,
    organization_id,
    workspace_id,
    product_id: "crm",
    app_role,
    granted_by,
    reason: "demo seed (multi-org)",
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
  if (error) throw new Error(`user_app_roles insert ${user_id}/${app_role}: ${error.message}`);
  counts.bridge_rows_created += 1;
}

export async function runSeed(): Promise<void> {
  const env = loadEnvLocal();
  const url = envOrThrow(env, "SUPABASE_URL").trim();
  const key = envOrThrow(env, "SUPABASE_SERVICE_ROLE_KEY").trim();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const counts: Counts = {
    orgs_created: 0,
    orgs_existing: 0,
    workspaces_created: 0,
    teams_created: 0,
    auth_users_created: 0,
    auth_users_existing: 0,
    profiles_created: 0,
    bridge_rows_created: 0,
  };

  const seedPwd = (process.env[SEED_CRED_ENV] ?? env[SEED_CRED_ENV] ?? "").trim();
  if (!seedPwd) {
    throw new Error(`${SEED_CRED_ENV} required (set in .env.local; documented in scripts/demo/README)`);
  }

  console.log(`[seed] multi-org demo · target=${url}`);

  // Look up the bootstrap super_admin to use as `granted_by`. If absent, fall back to system uuid.
  const { data: superRow } = await client
    .from("profiles")
    .select("id")
    .eq("base_role", "super_admin")
    .limit(1)
    .maybeSingle();
  const superId = (superRow?.id as string | undefined) ?? SYSTEM_UUID;

  // Phase 1 — orgs / workspaces / teams
  const orgIds = new Map<string, string>();
  const wsIds = new Map<string, string>();
  for (const org of ORGS) {
    const orgId = await upsertOrg(client, org, counts);
    orgIds.set(org.slug, orgId);
    const wsId = await upsertWorkspace(client, orgId, org, counts);
    wsIds.set(org.slug, wsId);
    await upsertTeam(client, orgId, wsId, org.team_name, counts);
  }

  // For granted_by we need a real profiles.id. If the only super_admin is the bootstrap one,
  // it has no organization_id, so it can grant any org's roles. We use it as the default.
  // Fallback: the first org_owner we create grants the rest in their own org.
  const ownerByOrg = new Map<string, string>(); // org_slug -> owner profile id

  // Phase 2 — users (auth + profile + bridge)
  for (const u of USERS) {
    const orgId = orgIds.get(u.org_slug)!;
    const wsId = wsIds.get(u.org_slug)!;
    const targetOrgId = u.base_role === "super_admin" ? null : orgId;

    // 2a — auth.users (idempotent via list-by-email)
    let authUser = await adminListUsers(url, key, u.email);
    if (authUser) {
      counts.auth_users_existing += 1;
      // Re-set password so the seed is the source of truth; idempotent against drift.
      await adminSetPassword(url, key, authUser.id, seedPwd);
    } else {
      authUser = await adminCreateUser(url, key, u.email, seedPwd);
      counts.auth_users_created += 1;
    }

    // 2b — profile
    await upsertProfile(
      client,
      authUser.id,
      u.email,
      u.display_name,
      u.base_role,
      targetOrgId,
      counts,
    );

    // 2c — bridge row
    if (u.base_role !== "super_admin") {
      const granter = u.app_role === "org_owner"
        ? superId
        : (ownerByOrg.get(u.org_slug) ?? superId);
      await upsertUserAppRole(
        client,
        authUser.id,
        orgId,
        // org_owner / org_admin / workspace_admin live at workspace level too,
        // but D-001 keeps NULL=org-wide. Sales roles also at org-wide here so super_admin
        // smoke-tests work without picking a workspace.
        wsId,
        u.app_role,
        granter,
        counts,
      );
      if (u.app_role === "org_owner") ownerByOrg.set(u.org_slug, authUser.id);
    }
  }

  console.log("\n=== seed summary ===");
  console.log(JSON.stringify(counts, null, 2));
  console.log("\n=== login credentials ===");
  console.log(`Password (all seeded users): ${seedPwd}`);
  console.log("Sign-in URL: https://crm.builtrix.com/auth/sign-in (or your local /auth/sign-in)");
  console.log("\nUsers:");
  console.log(`  superadmin@builtrixcrm.ai          super_admin      (existing — original password unchanged)`);
  for (const u of USERS) {
    const tier = ORGS.find((o) => o.slug === u.org_slug)!.plan_tier;
    const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
    console.log(`  ${pad(u.email, 36)} ${pad(u.app_role, 16)} (${u.org_slug}, ${tier})`);
  }
}

if (process.argv[1]?.endsWith("seed-multi-org.ts")) {
  runSeed().catch((err) => {
    console.error("[seed] FAILED", err);
    process.exit(1);
  });
}
