/**
 * D-001 / C5 — cross-tenant data leak prevention (@regression).
 * Spec AC-9 verified end-to-end via /api/auth/whoami and direct API calls.
 *
 * Two orgs each with a sales_rep. Org A's user calls /api/auth/whoami; payload
 * must reference only Org A. Then Org A's user attempts to read Org B's
 * organization row directly via the Supabase client; must return 0 rows.
 *
 * Tags: @regression
 */

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

const PASS = "T3st-pass-leak!!!";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

let orgA = "";
let orgB = "";
const repA = { email: "leak-rep-a@test.builtrix.in" };
const repB = { email: "leak-rep-b@test.builtrix.in" };

const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

test.beforeAll(async () => {
  test.skip(
    !admin || !ANON_KEY,
    "regression test needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY"
  );
  if (!admin) return;

  for (const slug of ["leak-test-a", "leak-test-b"]) {
    const { data: prior } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (prior) {
      await admin.from("profiles").delete().eq("organization_id", prior.id);
      await admin.from("organizations").delete().eq("id", prior.id);
    }
  }
  for (const email of [repA.email, repB.email]) {
    const { data } = await admin.auth.admin.listUsers();
    const u = data?.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }

  const seedOrg = async (slug: string) => {
    const { data } = await admin
      .from("organizations")
      .insert({
        slug,
        name: `Org ${slug}`,
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .select("id")
      .single();
    return data!.id as string;
  };
  orgA = await seedOrg("leak-test-a");
  orgB = await seedOrg("leak-test-b");

  const seedRep = async (email: string, orgId: string) => {
    const { data: u } = await admin.auth.admin.createUser({
      email,
      password: PASS,
      email_confirm: true,
    });
    await admin.from("profiles").insert({
      id: u!.user.id,
      organization_id: orgId,
      email,
      display_name: email,
      base_role: "sales_rep",
      created_by: u!.user.id,
      created_via: "system",
      updated_by: u!.user.id,
      updated_via: "system",
    });
  };
  await seedRep(repA.email, orgA);
  await seedRep(repB.email, orgB);
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.evaluate(
    async ({ url, key, email, password }) => {
      const { createClient } = await import(
        "https://esm.sh/@supabase/supabase-js@2"
      );
      const c = createClient(url, key);
      const { error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    { url: SUPABASE_URL, key: ANON_KEY, email, password: PASS }
  );
}

test.describe("@regression cross-tenant leak prevention", () => {
  test("/api/auth/whoami returns only the caller's own org context", async ({
    page,
  }) => {
    await signIn(page, repA.email);
    const res = await page.request.get("/api/auth/whoami");
    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.org_id).toBe(orgA);
    expect(payload.org_id).not.toBe(orgB);
  });

  test("Org A user cannot read Org B's organizations row", async ({ page }) => {
    await signIn(page, repA.email);
    const result = await page.evaluate(
      async ({ url, key, orgB }) => {
        const { createClient } = await import(
          "https://esm.sh/@supabase/supabase-js@2"
        );
        const c = createClient(url, key);
        const { data, error } = await c
          .from("organizations")
          .select("id")
          .eq("id", orgB);
        return { count: data?.length ?? 0, error: error?.message };
      },
      { url: SUPABASE_URL, key: ANON_KEY, orgB }
    );
    expect(result.count).toBe(0);
  });
});

test.afterAll(async () => {
  if (!admin) return;
  for (const orgId of [orgA, orgB].filter(Boolean)) {
    await admin.from("profiles").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const email of [repA.email, repB.email]) {
    const { data } = await admin.auth.admin.listUsers();
    const u = data?.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
});
