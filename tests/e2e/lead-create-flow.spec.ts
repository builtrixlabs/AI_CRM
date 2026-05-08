/**
 * D-007 — lead create end-to-end (@smoke).
 * Spec AC-1..AC-6: from /dashboard click "+ New lead", fill form, submit,
 * land on /dashboard/leads/<new-id> with state badge "new".
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

const ORG_SLUG = `e2e-d007-${Date.now()}`;
const REP_EMAIL = `e2e-d007-${Date.now()}@test.builtrix.in`;
const PASS = "T3st-pass-d007-create!!!";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

let orgId: string | null = null;
let wsId: string | null = null;
let repUserId: string | null = null;

test.beforeAll(async () => {
  test.skip(
    !admin || !ANON_KEY,
    "D-007 e2e needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY",
  );
  if (!admin) return;
  const org = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      name: `D-007 E2E ${ORG_SLUG}`,
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  orgId = (org.data as { id: string }).id;

  const ws = await admin
    .from("workspaces")
    .insert({
      organization_id: orgId,
      slug: "ws-d007",
      name: "D-007 Workspace",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  wsId = (ws.data as { id: string }).id;

  const u = await admin.auth.admin.createUser({
    email: REP_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  repUserId = (u.data as { user: { id: string } }).user.id;
  await admin.from("profiles").insert({
    id: repUserId,
    organization_id: orgId,
    email: REP_EMAIL,
    display_name: "D-007 Rep",
    base_role: "sales_rep",
    created_by: repUserId,
    created_via: "system",
    updated_by: repUserId,
    updated_via: "system",
  });
  await admin.from("user_app_roles").insert({
    user_id: repUserId,
    organization_id: orgId,
    workspace_id: wsId,
    product_id: "crm",
    app_role: "sales_rep",
    granted_by: repUserId,
    reason: "e2e seed",
    created_by: repUserId,
    created_via: "system",
    updated_by: repUserId,
    updated_via: "system",
  });
});

test.afterAll(async () => {
  if (!admin) return;
  if (orgId) {
    await admin.from("nodes").delete().eq("organization_id", orgId);
    await admin.from("user_app_roles").delete().eq("organization_id", orgId);
    await admin.from("workspaces").delete().eq("organization_id", orgId);
    await admin.from("profiles").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  if (repUserId) await admin.auth.admin.deleteUser(repUserId);
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  if (!admin) throw new Error("admin missing");
  const baseURL = page.url().startsWith("http")
    ? new URL(page.url()).origin
    : "http://localhost:3000";
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseURL}/auth/callback` },
  });
  const action = (link.data as { properties?: { action_link?: string } })
    .properties?.action_link;
  if (!action) throw new Error("generateLink returned no action_link");
  await page.goto(action);
  await page.waitForURL(/\/(platform|admin|dashboard|403)$/, {
    timeout: 20_000,
  });
}

test.describe("@smoke lead create flow", () => {
  test('"+ New lead" → fill → submit → land on canvas', async ({ page }) => {
    await signIn(page, REP_EMAIL);
    await page.goto("/dashboard");
    await expect(page.getByTestId("new-lead-trigger")).toBeVisible();
    await page.getByTestId("new-lead-trigger").click();
    await expect(page.getByTestId("new-lead-dialog")).toBeVisible();
    await page.getByTestId("new-phone").fill("+91-9090909090");
    // shadcn Select: open trigger and click an option
    await page.getByTestId("new-source").click();
    await page.getByText("walkin", { exact: true }).click();
    await page.getByTestId("new-submit").click();
    await page.waitForURL(/\/dashboard\/leads\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("lead-canvas")).toBeVisible();
    await expect(page.getByTestId("state-badge")).toHaveText("new");
  });
});
