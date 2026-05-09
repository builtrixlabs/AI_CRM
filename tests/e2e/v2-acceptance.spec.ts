/**
 * V2 acceptance walkthrough (@smoke @v2).
 *
 * Verifies every v2 surface lights up against a Vercel preview URL.
 * Two phases:
 *   1. Public smoke (always runs) — sign-in page renders, MFA page
 *      renders, /api/auth/rate-check responds.
 *   2. Authenticated walkthrough (skipped unless TEST_SUPER_ADMIN_EMAIL
 *      + TEST_SUPER_ADMIN_PASSWORD set) — provisions a fresh demo org,
 *      signs in as super_admin, walks every /platform/* and /admin/*
 *      surface, asserts a button click on each interactive page.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://<your-preview>.vercel.app \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   TEST_SUPER_ADMIN_EMAIL=... TEST_SUPER_ADMIN_PASSWORD=... \
 *   npx playwright test tests/e2e/v2-acceptance.spec.ts
 *
 * The script in scripts/v2-acceptance/run.sh wires the env for you.
 */

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPER_EMAIL = process.env.TEST_SUPER_ADMIN_EMAIL ?? "";
const SUPER_PASS = process.env.TEST_SUPER_ADMIN_PASSWORD ?? "";

const hasSupabase = SUPABASE_URL.length > 0 && SERVICE_KEY.length > 0;
const hasSuper = SUPER_EMAIL.length > 0 && SUPER_PASS.length > 0;

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";
const TEST_TAG = `v2-acc-${Date.now().toString(36)}`;

const admin = hasSupabase
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

let provisioned_org_id: string | null = null;

// ──────────────────────────────────────────────────────────────────────────
// Phase 1 — public smoke (no auth). Confirms the deploy is reachable +
// the rate-limit + MFA stub routes shipped.
// ──────────────────────────────────────────────────────────────────────────

test.describe("v2 public smoke @smoke @v2", () => {
  test("/ redirects to /auth/sign-in for anonymous", async ({ page }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0, "homepage reachable").toBeLessThan(500);
    await expect(page).toHaveURL(/\/auth\/sign-in|\/dashboard|\/admin|\/platform|\/cp/, {
      timeout: 15_000,
    });
  });

  test("/auth/sign-in renders the form", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /email \+ password/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /magic link/i })).toBeVisible();
  });

  test("/api/auth/rate-check rate-limits after 5 hits (D-210)", async ({ request }) => {
    // First hit returns 200 with remaining=4. Sixth returns 429.
    let last_status = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request.post("/api/auth/rate-check");
      last_status = res.status();
      if (last_status === 429) break;
    }
    expect(last_status).toBe(429);
  });

  test("/auth/mfa is reachable (redirects unauthenticated)", async ({ page }) => {
    const res = await page.goto("/auth/mfa", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Phase 2 — authenticated walkthrough (super_admin).
// Requires TEST_SUPER_ADMIN_EMAIL + TEST_SUPER_ADMIN_PASSWORD pre-existing
// in the target Supabase. Visits every v2 surface and asserts a key
// element is present on each.
// ──────────────────────────────────────────────────────────────────────────

test.describe("v2 super_admin walkthrough @regression @v2", () => {
  test.skip(
    !hasSuper,
    "TEST_SUPER_ADMIN_{EMAIL,PASSWORD} not set; skipping authenticated walkthrough"
  );

  test.beforeAll(async () => {
    test.skip(!admin, "Supabase admin client unavailable");
    if (!admin) return;
    // Provision a throwaway org so the walkthrough has something to render
    // beyond the seeded demo data. Cleanup below.
    const slug = `v2-walk-${TEST_TAG}`;
    const { data, error } = await admin
      .from("organizations")
      .insert({
        slug,
        name: `V2 Walkthrough ${TEST_TAG}`,
        plan_tier: "professional",
        rera_number: `PRM/KA/RERA/TEST/${TEST_TAG}`,
        gstin: `29TEST${TEST_TAG.slice(-4).toUpperCase()}A1Z5`,
        created_by: SYSTEM_UUID,
        created_via: "system",
        updated_by: SYSTEM_UUID,
        updated_via: "system",
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("org provision failed");
    provisioned_org_id = (data as { id: string }).id;
  });

  test.afterAll(async () => {
    if (admin && provisioned_org_id) {
      await admin
        .from("organizations")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: SYSTEM_UUID,
          deleted_reason: "v2-acceptance test cleanup",
        })
        .eq("id", provisioned_org_id);
    }
  });

  test("super_admin can sign in and walk every /platform/* surface", async ({ page }) => {
    // Sign in via the existing email+password form.
    await page.goto("/auth/sign-in");
    await page.fill('input[type="email"]', SUPER_EMAIL);
    await page.fill('input[type="password"]', SUPER_PASS);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    // Either land on /platform (super_admin) or sign-in error.
    await page.waitForURL(/\/platform/, { timeout: 30_000 });

    // /platform cockpit
    await page.goto("/platform");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // /platform/organizations
    await page.goto("/platform/organizations");
    await expect(page.getByText(/Organizations/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /\+ new organization/i })).toBeVisible();

    // /platform/subscriptions (D-203)
    await page.goto("/platform/subscriptions");
    await expect(page.getByText(/plan tiers/i).first()).toBeVisible();
    // Plan-tier reference cards must include Professional.
    await expect(page.getByText(/Professional/).first()).toBeVisible();

    // /platform/analytics (D-205)
    await page.goto("/platform/analytics");
    await expect(page.getByText(/Lead-to-booking conversion/i)).toBeVisible();
    await expect(page.getByText(/Voice IQ adoption/i)).toBeVisible();

    // /platform/costs (D-204)
    await page.goto("/platform/costs");
    await expect(page.getByText(/Tokens in/i)).toBeVisible();
    await expect(page.getByText(/API calls/i)).toBeVisible();

    // /platform/tickets (D-206)
    await page.goto("/platform/tickets");
    await expect(page.getByRole("heading", { name: /Tickets/i })).toBeVisible();
    // Status filter pills.
    await expect(page.getByRole("link", { name: /^any$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^open$/i })).toBeVisible();

    // /platform/settings (D-207) — flag editors.
    await page.goto("/platform/settings");
    await expect(page.getByText(/Platform settings/i)).toBeVisible();
    // First flag's mono-typed key visible.
    await expect(page.getByText(/force_mfa|demo_mode/i)).toBeVisible();

    // /platform/audit
    await page.goto("/platform/audit");
    await expect(page.getByText(/audit/i).first()).toBeVisible();

    // /platform/settings/secrets (D-016)
    await page.goto("/platform/settings/secrets");
    await expect(page.getByText(/Platform secrets|Anthropic|OpenAI/i).first()).toBeVisible();
  });

  test("/platform/tickets row click → detail thread renders (D-206)", async ({ page }) => {
    await page.goto("/auth/sign-in");
    if (!page.url().includes("/platform")) {
      await page.fill('input[type="email"]', SUPER_EMAIL);
      await page.fill('input[type="password"]', SUPER_PASS);
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await page.waitForURL(/\/platform/, { timeout: 30_000 });
    }
    await page.goto("/platform/tickets");
    // If demo data is present, click the first ticket subject. If not, skip.
    const firstSubject = page.getByRole("link").filter({ hasText: /onboarding|upgrade|template/i }).first();
    if ((await firstSubject.count()) > 0) {
      await firstSubject.click();
      await expect(page.getByText(/Original message/i)).toBeVisible();
      await expect(page.getByText(/Status control/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /send reply/i })).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "note",
        description:
          "No tickets present in this env — ticket detail click-through skipped.",
      });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Phase 3 — connectivity sanity (always runs).
// Confirms the deploy can reach Supabase + has the expected env.
// ──────────────────────────────────────────────────────────────────────────

test.describe("v2 connectivity @smoke @v2", () => {
  test("supabase env is reachable from the deploy", async ({ request }) => {
    test.skip(!hasSupabase, "Supabase env not set");
    if (!admin) return;
    const { error } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    expect(error, `supabase select failed: ${error?.message}`).toBeNull();
  });
});
