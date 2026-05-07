/**
 * D-006 — Canvas demo route smoke (@smoke).
 * Spec AC-18, AC-1..AC-6, AC-15..AC-17.
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

const ORG_SLUG = `e2e-canvas-${Date.now()}`;
const REP_EMAIL = `e2e-canvas-rep-${Date.now()}@test.builtrix.in`;
const PASS = "T3st-pass-canvas!!!";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

let orgId: string | null = null;
let repUserId: string | null = null;

test.beforeAll(async () => {
  test.skip(
    !admin || !ANON_KEY,
    "Canvas e2e needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY",
  );
  if (!admin) return;

  const { data: org } = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      name: `Canvas E2E Org ${ORG_SLUG}`,
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  orgId = org!.id;

  const { data: u } = await admin.auth.admin.createUser({
    email: REP_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  repUserId = u!.user.id;
  await admin.from("profiles").insert({
    id: repUserId,
    organization_id: orgId,
    email: REP_EMAIL,
    display_name: "Canvas Rep",
    base_role: "sales_rep",
    created_by: repUserId,
    created_via: "system",
    updated_by: repUserId,
    updated_via: "system",
  });
});

test.afterAll(async () => {
  if (!admin) return;
  if (repUserId) await admin.auth.admin.deleteUser(repUserId);
  if (orgId) {
    await admin.from("profiles").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  if (!admin) throw new Error("admin missing");
  const baseURL = page.url().startsWith("http")
    ? new URL(page.url()).origin
    : "http://localhost:3000";
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseURL}/auth/callback` },
  });
  if (error) throw error;
  const action = (data as { properties?: { action_link?: string } }).properties
    ?.action_link;
  if (!action) throw new Error("generateLink returned no action_link");
  await page.goto(action);
  await page.waitForURL(/\/(platform|admin|dashboard|403)$/, {
    timeout: 20_000,
  });
}

test.describe("@smoke canvas demo route", () => {
  test("renders the Priya Sharma demo, More toggle, and slot empty states", async ({
    page,
  }) => {
    await signIn(page, REP_EMAIL);
    await page.goto("/dashboard/leads/demo");
    await expect(page.getByTestId("lead-canvas")).toBeVisible();
    await expect(page.getByText("Priya Sharma")).toBeVisible();
    await expect(page.getByTestId("demo-banner")).toBeVisible();

    // More toggle reveals non-primary fields.
    const toggle = page.getByTestId("more-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('[data-testid="field-row"][data-key="email"]')).toBeVisible();

    // Activity stream rendered with the fixture rows.
    await expect(page.getByTestId("activity-stream")).toBeVisible();

    // Suggested action + agent panel slots show empty-state copy.
    await expect(page.getByTestId("suggested-action")).toHaveAttribute(
      "data-empty",
      "true",
    );
    await expect(page.getByTestId("agent-panel")).toHaveAttribute(
      "data-empty",
      "true",
    );
  });
});
