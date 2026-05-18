/**
 * D-017 / E1 — Admin directive authoring smoke (@smoke).
 *
 * Sign in as org_admin, navigate to /admin/directives, see the seeded
 * platform defaults, toggle one off, refresh, confirm persistence.
 *
 * Requires running app + Supabase project with D-011 seeds + D-017 RLS
 * policy. Test user is seeded via service-role client in beforeAll.
 *
 * Tags: @smoke (must pass before any merge to v1)
 */

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ORG_SLUG = "e2e-d017-directives";
const PASS = "T3st-pass-d017!!!";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

type Seeded = {
  org_id: string;
  org_admin: { email: string };
};

let seeded: Seeded;
const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

test.beforeAll(async () => {
  test.skip(!admin, "Supabase service-role env not set; skipping D-017 e2e");
  if (!admin) return;

  // Idempotent org provision.
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();

  let org_id: string;
  if (existing) {
    org_id = (existing as { id: string }).id;
  } else {
    const { data, error } = await admin
      .from("organizations")
      .insert({
        slug: ORG_SLUG,
        name: "D-017 Directives E2E",
        plan_tier: "starter",
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .select("id")
      .single();
    if (error) throw error;
    org_id = (data as { id: string }).id;
  }

  const email = `d017-admin-${Date.now()}@example.test`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
    app_metadata: { organization_id: org_id, base_role: "org_admin" },
  });
  if (userErr || !created.user) throw userErr ?? new Error("createUser failed");

  await admin.from("profiles").upsert({
    id: created.user.id,
    organization_id: org_id,
    base_role: "org_admin",
    display_name: "D017 Admin",
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });

  seeded = {
    org_id,
    org_admin: { email },
  };
});

test("@smoke org_admin can list, toggle, and persist a directive", async ({
  page,
}) => {
  test.skip(!seeded, "no seeded data — env vars not set");

  // Sign in.
  await page.goto("/auth/sign-in");
  await page.getByLabel(/email/i).fill(seeded.org_admin.email);
  await page.getByLabel(/password/i).fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(admin|dashboard)/);

  // Navigate to /admin/directives.
  await page.goto("/admin/directives");
  await expect(
    page.getByRole("heading", { name: /^Directives$/ }),
  ).toBeVisible();

  // At least 15 platform defaults seeded by D-011.
  const rows = page.locator("table tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(15);

  // Toggle the first row off.
  const firstToggle = rows.first().locator('button[aria-checked="true"]');
  if ((await firstToggle.count()) > 0) {
    const code = await rows.first().locator("td").first().innerText();
    await firstToggle.first().click();
    // Server form submit triggers a reload; wait for the page to settle.
    await page.waitForLoadState("networkidle");
    // Find the same code row and confirm aria-checked is false.
    const row = page.locator(`tr:has(td:has-text("${code.trim()}"))`).first();
    await expect(
      row.locator('button[aria-checked="false"]').first(),
    ).toBeVisible();
  }
});

test("@smoke org_admin sees the New directive trigger", async ({ page }) => {
  test.skip(!seeded, "no seeded data — env vars not set");

  await page.goto("/auth/sign-in");
  await page.getByLabel(/email/i).fill(seeded.org_admin.email);
  await page.getByLabel(/password/i).fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(admin|dashboard)/);

  await page.goto("/admin/directives");
  await expect(page.getByTestId("new-directive-trigger")).toBeVisible();
});
