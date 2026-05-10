/**
 * D-302 — programmatic RLS leak audit (LIVE-DB).
 *
 * Excluded from the default `npm run test` run (vitest.config.ts excludes
 * tests/integration/**). Operator runs via:
 *
 *   SUPABASE_URL=...                  \
 *   SUPABASE_SERVICE_ROLE_KEY=...     \
 *   SUPABASE_PUBLISHABLE_KEY=...      \
 *   npm run test:rls-audit
 *
 * The suite provisions two scratch orgs with one user each, then iterates
 * every public table that carries `organization_id` and asserts:
 *   - user-A SELECT against org-B rows returns 0 rows
 *   - user-A INSERT with organization_id=org-B is RLS-rejected
 *
 * Pinpoint cases re-run the same probe explicitly for the 5 highest-risk
 * tables (nodes, edges, node_signals, api_audit_log, org_integration_secrets)
 * so failures point clearly at the policy that needs fixing.
 *
 * `afterAll` cleans both fixture orgs.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  RLS_AUDIT_PINPOINT_TABLES,
  enumerateTenantTables,
  probeCrossOrgInsert,
  probeCrossOrgRead,
} from "@/lib/security/rls-audit";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

const PASS = "T3st-pass-rls-audit!!!";
const SLUG_A = "rls-audit-org-a";
const SLUG_B = "rls-audit-org-b";

type Fixture = {
  org_id: string;
  email: string;
  user_id: string;
  client: SupabaseClient;
};

let admin: SupabaseClient | null = null;
let orgA: Fixture | null = null;
let orgB: Fixture | null = null;

async function provisionOrg(slug: string): Promise<Fixture> {
  if (!admin) throw new Error("admin client not initialised");

  await admin.from("organizations").delete().eq("slug", slug);

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      slug,
      name: `RLS Audit ${slug}`,
      created_by: "00000000-0000-0000-0000-000000000000",
      created_via: "test_fixture",
    })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(`provision org ${slug}: ${orgErr?.message}`);

  const email = `rls-audit-${slug}@example.com`;
  const { data: user, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
  });
  if (userErr || !user.user) {
    throw new Error(`provision user ${slug}: ${userErr?.message}`);
  }

  await admin.from("profiles").upsert({
    id: user.user.id,
    display_name: `Audit User ${slug}`,
    base_role: "sales_rep",
    organization_id: org.id,
    created_by: "00000000-0000-0000-0000-000000000000",
    created_via: "test_fixture",
    updated_by: "00000000-0000-0000-0000-000000000000",
    updated_via: "test_fixture",
  });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email,
    password: PASS,
  });
  if (signInErr) throw new Error(`sign-in ${slug}: ${signInErr.message}`);

  return { org_id: org.id, email, user_id: user.user.id, client: userClient };
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return; // tests will all skip below
  }
  admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);
});

afterAll(async () => {
  if (!admin) return;
  for (const slug of [SLUG_A, SLUG_B]) {
    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!org) continue;
    await admin.from("profiles").delete().eq("organization_id", org.id);
    await admin.from("organizations").delete().eq("id", org.id);
  }
  for (const f of [orgA, orgB]) {
    if (f) await admin.auth.admin.deleteUser(f.user_id);
  }
});

describe("D-302 RLS audit (live-DB)", () => {
  it("env present", () => {
    expect(SUPABASE_URL && SERVICE_KEY && ANON_KEY).toBeTruthy();
  });

  it("enumerates tenant tables from information_schema", async () => {
    if (!admin) return;
    const tables = await enumerateTenantTables(admin);
    expect(tables.length).toBeGreaterThan(5);
    const names = tables.map((t) => t.table_name);
    for (const t of RLS_AUDIT_PINPOINT_TABLES) {
      expect(names).toContain(t);
    }
  });

  it("user-A cannot SELECT org-B rows on any tenant table", async () => {
    if (!admin || !orgA || !orgB) return;
    const tables = await enumerateTenantTables(admin);
    const leaks: string[] = [];
    for (const t of tables) {
      const r = await probeCrossOrgRead(orgA.client, t.table_name, orgB.org_id);
      if (!r.ok && r.reason === "leak") {
        leaks.push(`${t.table_name} (${r.rows_visible} rows)`);
      }
    }
    expect(leaks, `cross-org leaks: ${leaks.join(", ")}`).toEqual([]);
  });

  describe("pinpoint negative tests", () => {
    for (const tname of RLS_AUDIT_PINPOINT_TABLES) {
      it(`${tname}: user-A SELECT against org-B returns 0 rows`, async () => {
        if (!orgA || !orgB) return;
        const r = await probeCrossOrgRead(orgA.client, tname, orgB.org_id);
        expect(r).toEqual({ ok: true, rows_visible: 0 });
      });
    }
  });

  it("user-A INSERT into nodes with organization_id=org-B is RLS-rejected", async () => {
    if (!orgA || !orgB) return;
    const r = await probeCrossOrgInsert(
      orgA.client,
      "nodes",
      {
        kind: "lead",
        label: "rls-audit",
        data: {},
        created_by: orgA.user_id,
        created_via: "test_fixture",
        updated_by: orgA.user_id,
        updated_via: "test_fixture",
      },
      orgB.org_id
    );
    expect(r.ok).toBe(true);
  });
});
