/**
 * D-007 — lead edit + transition end-to-end (@smoke).
 * Spec AC-7..AC-17: Edit toggle → Save; transition new→contacted; terminal
 * → reason dialog → confirm; footer becomes terminal.
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

const ORG_SLUG = `e2e-d007-edit-${Date.now()}`;
const REP_EMAIL = `e2e-d007-edit-${Date.now()}@test.builtrix.in`;
const PASS = "T3st-pass-d007-edit!!!";
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
    "D-007 e2e needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY",
  );
  if (!admin) return;
  const org = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      name: `D-007 Edit E2E ${ORG_SLUG}`,
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
      slug: "ws-d007-edit",
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
    display_name: "Edit Rep",
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
  // Seed a lead in 'new' state.
  const lead = await admin
    .from("nodes")
    .insert({
      organization_id: orgId,
      workspace_id: wsId,
      node_type: "lead",
      label: "Edit Test Lead",
      data: { phone: "+91-9090909091", source: "walkin" },
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

test.describe("@smoke lead edit + transition", () => {
  test("Edit + Save; transition new → contacted; terminal-with-reason → footer terminal copy", async ({
    page,
  }) => {
    await signIn(page, REP_EMAIL);
    await page.goto(`/dashboard/leads/${leadId}`);
    await expect(page.getByTestId("lead-canvas")).toBeVisible();
    await expect(page.getByTestId("state-badge")).toHaveText("new");

    // Edit + save
    await page.getByTestId("edit-mode-toggle").click();
    await expect(page.getByTestId("edit-lead-form")).toBeVisible();
    await page.getByTestId("edit-notes").fill("follow-up tomorrow");
    await page.getByTestId("edit-save").click();
    // After save, edit form unmounts → header re-renders
    await expect(page.getByTestId("edit-lead-form")).toHaveCount(0);

    // Forward transition: new → contacted
    await page.getByTestId("transition-contacted").click();
    await expect(page.getByTestId("state-badge")).toHaveText("contacted", {
      timeout: 10_000,
    });

    // Terminal transition with reason
    await page.getByTestId("transition-lost").click();
    await expect(page.getByTestId("transition-reason-dialog")).toBeVisible();
    await page.getByTestId("reason-textarea").fill("duplicate of #100");
    await page.getByTestId("reason-submit").click();
    await expect(page.getByTestId("state-badge")).toHaveText("lost", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("transition-footer")).toHaveAttribute(
      "data-terminal",
      "true",
    );
  });
});
