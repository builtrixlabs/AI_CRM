/**
 * D-006 — Lead canvas 404 smoke (@smoke).
 * Spec AC-19: cross-tenant or non-existent lead → 404 (no existence leak).
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

const REP_EMAIL = `e2e-canvas-404-${Date.now()}@test.builtrix.in`;
const ORG_SLUG = `e2e-canvas-404-${Date.now()}`;
const PASS = "T3st-pass-canvas-404!!!";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";
const BOGUS_LEAD_ID = "00000000-0000-4000-8000-00000000dead";

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
    "Canvas-404 e2e needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY",
  );
  if (!admin) return;
  const { data: org } = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      name: `Canvas 404 Org ${ORG_SLUG}`,
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
    display_name: "Canvas 404 Rep",
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

test.describe("@smoke canvas 404", () => {
  test("/dashboard/leads/<bogus-uuid> returns 404 without existence leak", async ({
    page,
  }) => {
    await signIn(page, REP_EMAIL);
    const response = await page.goto(`/dashboard/leads/${BOGUS_LEAD_ID}`);
    expect(response?.status()).toBe(404);
  });
});
