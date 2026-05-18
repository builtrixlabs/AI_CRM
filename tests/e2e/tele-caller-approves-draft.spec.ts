/**
 * v6.2.1 (D-617 phase) — E2E spec for inline draft approval.
 *
 * Story: a tele-caller signs in, opens a lead they own that has an AI
 * draft pending, clicks Approve, and sees the success confirmation
 * inline on the lead canvas without navigating to /admin/agents/queue.
 *
 * Seed shape:
 *   - Fresh org with the `lead_canvas_v2` feature flag flipped on.
 *   - A sales_rep profile.
 *   - A lead assigned to that rep (data.assigned_sales_rep_id = rep.id).
 *   - A pending agent_approval_queue row of agent_kind='follow_up_stale_lead'
 *     (the simplest draft kind — no brochure, no site visit).
 *
 * Mocked dispatch: the existing `dispatchApprovedDraft` will attempt to
 * actually send via the org's WhatsApp adapter. With no adapter
 * configured for this fresh org, dispatch returns `not_configured` which
 * the UI renders as the "deferred" banner — that's enough to assert the
 * approve flow worked end-to-end without depending on a live provider.
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

const STAMP = Date.now();
const ORG_SLUG = `e2e-inline-approval-${STAMP}`;
const REP_EMAIL = `e2e-inline-approval-rep-${STAMP}@test.builtrix.in`;
const PASS = "T3st-pass-inline-approval!!!";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

let orgId: string | null = null;
let workspaceId: string | null = null;
let repUserId: string | null = null;
let leadId: string | null = null;
let queueId: string | null = null;

test.beforeAll(async () => {
  test.skip(
    !admin || !ANON_KEY,
    "Inline approval e2e needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY",
  );
  if (!admin) return;

  // 1. Org with feature flag on.
  const { data: org } = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      name: `Inline Approval E2E ${ORG_SLUG}`,
      feature_flags: { lead_canvas_v2: true },
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  orgId = (org as { id: string }).id;

  // 2. Workspace (required for lead.workspace_id NOT NULL).
  const { data: ws } = await admin
    .from("workspaces")
    .insert({
      organization_id: orgId,
      slug: "default",
      name: "Default",
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  workspaceId = (ws as { id: string }).id;

  // 3. Sales rep profile.
  const { data: u } = await admin.auth.admin.createUser({
    email: REP_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (!u || !u.user) throw new Error("createUser returned no user");
  repUserId = u.user.id;
  await admin.from("profiles").insert({
    id: repUserId,
    organization_id: orgId,
    email: REP_EMAIL,
    display_name: "Inline Approval Rep",
    base_role: "sales_rep",
    created_by: repUserId,
    created_via: "system",
    updated_by: repUserId,
    updated_via: "system",
  });

  // 4. Lead, assigned to the rep.
  const { data: lead } = await admin
    .from("nodes")
    .insert({
      organization_id: orgId,
      workspace_id: workspaceId,
      node_type: "lead",
      label: "Inline Approval E2E Lead",
      state: "contacted",
      data: {
        phone: "+919900000000",
        source: "other",
        assigned_sales_rep_id: repUserId,
      },
      created_by: repUserId,
      created_via: "manual",
      updated_by: repUserId,
      updated_via: "manual",
    })
    .select("id")
    .single();
  leadId = (lead as { id: string }).id;

  // 5. Pending draft on the queue.
  const { data: q } = await admin
    .from("agent_approval_queue")
    .insert({
      organization_id: orgId,
      workspace_id: workspaceId,
      lead_id: leadId,
      agent_kind: "follow_up_stale_lead",
      channel: "whatsapp",
      draft_body:
        "Hi, just checking in — did you get a chance to review the proposal?",
      status: "pending",
      created_by_agent_id: SYSTEM_UUID,
    })
    .select("id")
    .single();
  queueId = (q as { id: string }).id;
});

test.afterAll(async () => {
  if (!admin) return;
  if (queueId)
    await admin.from("agent_approval_queue").delete().eq("id", queueId);
  if (leadId) await admin.from("nodes").delete().eq("id", leadId);
  if (repUserId) await admin.auth.admin.deleteUser(repUserId);
  if (orgId) {
    await admin.from("profiles").delete().eq("organization_id", orgId);
    await admin.from("workspaces").delete().eq("organization_id", orgId);
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

test.describe("@smoke v6.2.1 inline draft approval", () => {
  test("tele-caller approves their own AI draft on the lead canvas", async ({
    page,
  }) => {
    test.skip(!leadId || !queueId, "seed failed");

    await signIn(page, REP_EMAIL);
    await page.goto(`/dashboard/leads/${leadId}`);

    // v2 canvas shell renders.
    await expect(page.getByTestId("lead-canvas-v2")).toBeVisible();

    // AI Drafts tab badge shows the pending count (1).
    const badge = page.getByTestId("lead-canvas-tab-ai_drafts-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1");

    // Auto-select on load (AI Drafts is the default tab when count > 0).
    await expect(
      page.getByTestId(`lead-canvas-tabpanel-ai_drafts`),
    ).toBeVisible();

    // The draft card is interactive (rep owns this lead → canApprove=true).
    const approveBtn = page.getByTestId(`draft-approve-${queueId}`);
    await expect(approveBtn).toBeEnabled();

    // Approve. Dispatch will report not_configured (no WhatsApp adapter on the
    // fresh org), so the UI shows the deferred-integration banner. That still
    // confirms the approve flow worked end-to-end through canApproveQueueItem.
    await approveBtn.click();
    await expect(
      page.getByText(/Approved|Configure your whatsapp integration/i),
    ).toBeVisible({ timeout: 10_000 });

    // The queue row server-side should now be approved or sent (not pending).
    if (admin && queueId) {
      const { data } = await admin
        .from("agent_approval_queue")
        .select("status, decided_by")
        .eq("id", queueId)
        .single();
      const row = data as { status: string; decided_by: string | null };
      expect(["approved", "sent"]).toContain(row.status);
      expect(row.decided_by).toBe(repUserId);
    }
  });

  test("non-owner sales rep sees the draft but cannot approve", async ({
    page,
    browser,
  }) => {
    test.skip(!leadId || !queueId, "seed failed");
    if (!admin || !orgId) return;

    // Spin up a second rep in the same org who does NOT own the lead.
    const otherEmail = `e2e-other-rep-${STAMP}@test.builtrix.in`;
    const { data: otherUser } = await admin.auth.admin.createUser({
      email: otherEmail,
      password: PASS,
      email_confirm: true,
    });
    if (!otherUser || !otherUser.user) {
      throw new Error("createUser returned no user");
    }
    const otherId = otherUser.user.id;
    await admin.from("profiles").insert({
      id: otherId,
      organization_id: orgId,
      email: otherEmail,
      display_name: "Other Rep",
      base_role: "sales_rep",
      created_by: otherId,
      created_via: "system",
      updated_by: otherId,
      updated_via: "system",
    });

    // Re-seed a pending draft (the first test may have approved the
    // original; create a fresh one for this assertion).
    const { data: q2 } = await admin
      .from("agent_approval_queue")
      .insert({
        organization_id: orgId,
        workspace_id: workspaceId,
        lead_id: leadId,
        agent_kind: "follow_up_stale_lead",
        channel: "whatsapp",
        draft_body: "Second draft for non-owner test",
        status: "pending",
        created_by_agent_id: SYSTEM_UUID,
      })
      .select("id")
      .single();
    const q2Id = (q2 as { id: string }).id;

    try {
      const ctx = await browser.newContext();
      const otherPage = await ctx.newPage();
      await signIn(otherPage, otherEmail);
      await otherPage.goto(`/dashboard/leads/${leadId}`);
      await expect(otherPage.getByTestId("lead-canvas-v2")).toBeVisible();
      const otherBtn = otherPage.getByTestId(`draft-approve-${q2Id}`);
      await expect(otherBtn).toBeDisabled();
      await expect(
        otherPage.getByTestId(`draft-disabled-${q2Id}`),
      ).toBeVisible();
      await ctx.close();
    } finally {
      await admin.from("agent_approval_queue").delete().eq("id", q2Id);
      await admin.auth.admin.deleteUser(otherId);
    }
  });
});
