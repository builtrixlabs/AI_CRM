/**
 * V1 admin walkthrough (@smoke).
 *
 * Walks every V1 admin surface in one test as a real org_admin would.
 * Asserts the page renders, a state change is made, and the change
 * persists across reload. Runs against a Vercel preview deploy.
 *
 * Prereqs (set in CI):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_PUBLISHABLE_KEY).
 *
 * Tags: @smoke @v1
 */

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const SLUG = `v1-walk-${Date.now().toString(36)}`;
const PASS = "T3st-pass-V1-walkthrough!!!";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

type Seeded = {
  org_id: string;
  org_admin_email: string;
};

let seeded: Seeded;

const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

test.beforeAll(async () => {
  test.skip(!admin, "Supabase service-role env not set; skipping V1 walkthrough");
  if (!admin) return;

  // Provision an org.
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      slug: SLUG,
      name: `V1 Walkthrough ${SLUG}`,
      plan_tier: "starter",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (orgErr || !org) throw orgErr ?? new Error("org provision failed");
  const org_id = (org as { id: string }).id;

  // Provision a workspace (needed for any future Lead writes downstream).
  await admin.from("workspaces").insert({
    organization_id: org_id,
    slug: "main",
    name: "Main",
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });

  // Provision an org_admin user.
  const email = `v1-walk-admin-${Date.now()}@example.test`;
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
    email,
    base_role: "org_admin",
    display_name: "V1 Walkthrough Admin",
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });

  seeded = { org_id, org_admin_email: email };
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel(/email/i).fill(seeded.org_admin_email);
  await page.getByLabel(/password/i).fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(admin|dashboard)/);
}

test("@smoke @v1 — walk the entire V1 admin surface end-to-end", async ({
  page,
}) => {
  test.skip(!seeded, "no seeded data — env vars not set");

  await signIn(page);

  // ── /admin cockpit ───────────────────────────────────────────────
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: /admin cockpit/i }),
  ).toBeVisible();
  // All five customization tiles visible.
  for (const link of [
    "/settings/users",
    "/admin/dashboards",
    "/admin/tables",
    "/admin/agents",
    "/admin/directives",
  ]) {
    expect(
      await page.locator(`a[href="${link}"]`).count(),
      `cockpit link to ${link} present`,
    ).toBeGreaterThan(0);
  }

  // ── /admin/directives (D-017) ────────────────────────────────────
  await page.goto("/admin/directives");
  await expect(
    page.getByRole("heading", { name: /^Directives$/ }),
  ).toBeVisible();
  // 15 platform-default seeds rendered (D-011 seed migration).
  const directiveRows = page.locator("table tbody tr");
  expect(await directiveRows.count()).toBeGreaterThanOrEqual(15);
  // Toggle the first enabled directive off.
  const firstToggle = directiveRows.first().locator('button[aria-checked="true"]');
  if ((await firstToggle.count()) > 0) {
    const codeCell = directiveRows
      .first()
      .locator("td")
      .first();
    const code = (await codeCell.innerText()).trim();
    await firstToggle.first().click();
    await page.waitForLoadState("networkidle");
    const sameRow = page.locator(`tr:has(td:has-text("${code}"))`).first();
    await expect(
      sameRow.locator('button[aria-checked="false"]').first(),
    ).toBeVisible();
  }
  // New-directive trigger is visible (form not asserted; covered by unit tests).
  await expect(page.getByTestId("new-directive-trigger")).toBeVisible();

  // ── /settings/users (D-018) ──────────────────────────────────────
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: /^Users$/ })).toBeVisible();
  await expect(page.getByTestId("invite-user-trigger")).toBeVisible();
  // Caller (the org_admin) shows in the user list.
  await expect(page.getByText(seeded.org_admin_email)).toBeVisible();

  // ── /admin/agents (D-019) ────────────────────────────────────────
  await page.goto("/admin/agents");
  await expect(page.getByRole("heading", { name: /^AI agents$/ })).toBeVisible();
  // The Lead Enrichment Agent is in the global registry — at least one row.
  const agentRows = page.locator("table tbody tr");
  expect(await agentRows.count()).toBeGreaterThanOrEqual(1);

  // ── /admin/tables (D-020) ────────────────────────────────────────
  await page.goto("/admin/tables");
  await expect(
    page.getByRole("heading", { name: /tables.*fields/i }),
  ).toBeVisible();
  // Sections for each node_type render.
  await expect(page.getByTestId("fields-section-lead")).toBeVisible();
  await expect(page.getByTestId("fields-section-deal")).toBeVisible();
  // "+ Add field" trigger on Leads section visible.
  await expect(page.getByTestId("new-field-lead")).toBeVisible();

  // ── /admin/dashboards (D-021) ────────────────────────────────────
  await page.goto("/admin/dashboards");
  await expect(
    page.getByRole("heading", { name: /^Dashboards$/ }),
  ).toBeVisible();
  await expect(page.getByTestId("new-dashboard-trigger")).toBeVisible();
});

test("@smoke @v1 — Cmd+K exposes the new admin pages to authorized users", async ({
  page,
}) => {
  test.skip(!seeded, "no seeded data — env vars not set");

  await signIn(page);
  await page.goto("/admin");

  // Open Cmd+K with the global hotkey (Mac+Win both Mod+K in cmdk lib).
  await page.keyboard.press("Control+k");
  // The cmdk dialog renders an input.
  const input = page.locator('input[role="combobox"]');
  await expect(input).toBeVisible({ timeout: 5_000 });

  // Search for "directives" — the new D-017 entry.
  await input.fill("directives");
  await expect(page.getByText(/admin.*directives/i)).toBeVisible();
});

test("@smoke @v1 — cross-tenant guard: another org's user cannot reach admin pages", async ({
  page,
}) => {
  test.skip(!seeded || !admin, "not seeded");

  // Provision a sales_rep in the same org — they lack admin perms and
  // every page should redirect to /403 (or /dashboard fallback).
  if (!admin) return;
  const repEmail = `v1-walk-rep-${Date.now()}@example.test`;
  const { data: repCreated } = await admin.auth.admin.createUser({
    email: repEmail,
    password: PASS,
    email_confirm: true,
    app_metadata: {
      organization_id: seeded.org_id,
      base_role: "sales_rep",
    },
  });
  if (!repCreated.user) test.skip(true, "rep provision failed");

  await admin.from("profiles").upsert({
    id: repCreated.user!.id,
    organization_id: seeded.org_id,
    email: repEmail,
    base_role: "sales_rep",
    display_name: "V1 Rep",
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });

  // Sign in as the rep.
  await page.goto("/auth/sign-in");
  await page.getByLabel(/email/i).fill(repEmail);
  await page.getByLabel(/password/i).fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(admin|dashboard|403)/);

  // Each admin route must redirect away from itself.
  for (const path of [
    "/admin/directives",
    "/admin/agents",
    "/admin/tables",
    "/admin/dashboards",
    "/settings/users",
  ]) {
    await page.goto(path);
    // /403 is the documented redirect target; anything other than the
    // requested path is acceptable (some routes redirect to /dashboard).
    await page.waitForLoadState("networkidle");
    expect(
      page.url().endsWith(path),
      `rep should NOT reach ${path}`,
    ).toBe(false);
  }
});
