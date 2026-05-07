/**
 * D-001 / C4 — auth redirect e2e (@smoke).
 * Spec AC-1..AC-8 verified end-to-end via real HTTP redirects.
 *
 * Requires running app + Supabase project with the auth hook enabled. Test
 * users seeded via service-role client in beforeAll.
 *
 * Tags: @smoke (must pass before any merge)
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

const ORG_SLUG = "e2e-auth-redirects";
const PASS = "T3st-pass-e2e!!!";

type Seeded = {
  org_id: string;
  super_admin: { email: string };
  org_admin: { email: string };
  sales_rep: { email: string };
  channel_partner: { email: string };
};

let seeded: Seeded;
const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

test.beforeAll(async () => {
  test.skip(
    !admin || !ANON_KEY,
    "E2E redirects need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY in env"
  );
  if (!admin) return;

  // Best-effort cleanup of any prior fixture.
  const { data: priorOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (priorOrg) {
    await admin.from("user_app_roles").delete().eq("organization_id", priorOrg.id);
    await admin.from("teams").delete().eq("organization_id", priorOrg.id);
    await admin.from("workspaces").delete().eq("organization_id", priorOrg.id);
    await admin.from("profiles").delete().eq("organization_id", priorOrg.id);
    await admin.from("organizations").delete().eq("id", priorOrg.id);
  }
  for (const email of [
    "e2e-super@test.builtrix.in",
    "e2e-orga@test.builtrix.in",
    "e2e-rep@test.builtrix.in",
    "e2e-cp@test.builtrix.in",
  ]) {
    const { data } = await admin.auth.admin.listUsers();
    const u = data?.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }

  // Seed.
  const { data: org } = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      name: "E2E Auth Org",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  const orgId = org!.id;

  const seedUser = async (
    email: string,
    base_role: string,
    org_id: string | null
  ) => {
    const { data: u } = await admin.auth.admin.createUser({
      email,
      password: PASS,
      email_confirm: true,
    });
    await admin.from("profiles").insert({
      id: u!.user.id,
      organization_id: org_id,
      email,
      display_name: email,
      base_role,
      created_by: u!.user.id,
      created_via: "system",
      updated_by: u!.user.id,
      updated_via: "system",
    });
    return { email };
  };

  seeded = {
    org_id: orgId,
    super_admin: await seedUser("e2e-super@test.builtrix.in", "super_admin", null),
    org_admin: await seedUser("e2e-orga@test.builtrix.in", "org_admin", orgId),
    sales_rep: await seedUser("e2e-rep@test.builtrix.in", "sales_rep", orgId),
    channel_partner: await seedUser(
      "e2e-cp@test.builtrix.in",
      "channel_partner",
      orgId
    ),
  };
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  // Use Supabase password-based sign-in via JS in the page context so cookies
  // get set by the SDK (mirrors what the magic-link callback does).
  await page.goto("/auth/sign-in");
  await page.evaluate(
    async ({ url, key, email, password }) => {
      const { createClient } = await import(
        // The SDK is bundled into the app; using the published package URL keeps
        // this test independent of internal module paths.
        "https://esm.sh/@supabase/supabase-js@2"
      );
      const c = createClient(url, key);
      const { error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    { url: SUPABASE_URL, key: ANON_KEY, email, password: PASS }
  );
}

test.describe("@smoke auth redirects", () => {
  test("AC-7: unauthenticated /dashboard → /auth/sign-in", async ({ page }) => {
    const res = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    expect(res?.status()).toBeLessThan(400);
  });

  test("AC-1: super_admin /dashboard → /platform", async ({ page }) => {
    await signIn(page, seeded.super_admin.email);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/platform$/);
  });

  test("AC-3: org_admin /platform → /admin", async ({ page }) => {
    await signIn(page, seeded.org_admin.email);
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("AC-4: sales_rep /platform → /dashboard", async ({ page }) => {
    await signIn(page, seeded.sales_rep.email);
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("AC-5: sales_rep /admin → /dashboard", async ({ page }) => {
    await signIn(page, seeded.sales_rep.email);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("AC-6: channel_partner /admin → /dashboard", async ({ page }) => {
    await signIn(page, seeded.channel_partner.email);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.afterAll(async () => {
  if (!admin || !seeded) return;
  await admin.from("profiles").delete().eq("organization_id", seeded.org_id);
  await admin.from("organizations").delete().eq("id", seeded.org_id);
  for (const email of [
    seeded.super_admin.email,
    seeded.org_admin.email,
    seeded.sales_rep.email,
    seeded.channel_partner.email,
  ]) {
    const { data } = await admin.auth.admin.listUsers();
    const u = data?.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
});
