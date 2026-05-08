/**
 * D-008 — Cmd+K lookup-lead end-to-end (@smoke).
 * Spec AC-14..AC-16: lookup-prefix sub-mode → debounced searchLeads
 * → results render → selecting navigates to /dashboard/leads/<id>.
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

const ORG_SLUG = `e2e-cmdk-look-${Date.now()}`;
const REP_EMAIL = `e2e-cmdk-look-${Date.now()}@test.builtrix.in`;
const PASS = "T3st-pass-cmdk-look!!!";
const LEAD_LABEL = `LookupTarget ${Date.now()}`;
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
let leadId: string | null = null;

test.beforeAll(async () => {
  test.skip(
    !admin || !ANON_KEY,
    "Cmd+K lookup e2e needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY",
  );
  if (!admin) return;
  const org = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      name: `Cmd+K Lookup ${ORG_SLUG}`,
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
      slug: "ws-cmdk-look",
      name: "ws",
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
    display_name: "Lookup Rep",
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
  // Seed a lead with the recognizable label.
  const lead = await admin
    .from("nodes")
    .insert({
      organization_id: orgId,
      workspace_id: wsId,
      node_type: "lead",
      label: LEAD_LABEL,
      data: { phone: "+91-9000000099", source: "walkin" },
      state: "new",
      created_by: repUserId,
      created_via: "manual",
      updated_by: repUserId,
      updated_via: "manual",
    })
    .select("id")
    .single();
  leadId = (lead.data as { id: string }).id;
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

test.describe("@smoke Cmd+K lookup-lead", () => {
  test("Open lead by name… → debounced search → result → navigate", async ({
    page,
  }) => {
    await signIn(page, REP_EMAIL);
    await page.goto("/dashboard");
    await page.keyboard.press("Control+KeyK");
    await page.getByTestId("command-lead-open-by-name").click();
    await expect(page.getByTestId("command-palette")).toHaveAttribute(
      "data-mode",
      "lookup",
    );
    await page.getByTestId("command-palette-input").fill("LookupTarget");
    const result = page.getByTestId(`lookup-result-${leadId}`);
    await expect(result).toBeVisible({ timeout: 5_000 });
    await result.click();
    await page.waitForURL(new RegExp(`/dashboard/leads/${leadId}$`), {
      timeout: 10_000,
    });
    await expect(page.getByTestId("lead-canvas")).toBeVisible();
  });
});
