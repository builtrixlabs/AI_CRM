import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  canApproveQueueItem: vi.fn(),
  dispatchApprovedDraft: vi.fn(),
  confirmSiteVisitBooking: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));
vi.mock("@/lib/auth/can-approve-queue-item", () => ({
  canApproveQueueItem: mocks.canApproveQueueItem,
}));
vi.mock("@/lib/agents/follow-up/dispatch", () => ({
  dispatchApprovedDraft: mocks.dispatchApprovedDraft,
}));
vi.mock("@/lib/agents/site-visit-agent", () => ({
  confirmSiteVisitBooking: mocks.confirmSiteVisitBooking,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  approveDraftOnLeadAction,
  rejectDraftOnLeadAction,
  confirmSiteVisitOnLeadAction,
} from "@/app/(dashboard)/dashboard/leads/[id]/actions/draft-actions";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "44444444-2222-4333-8444-555555555555";
const LEAD = "77777777-2222-4333-8444-555555555555";
const QID = "99999999-2222-4333-8444-555555555555";

function asUser(base_role = "sales_rep") {
  return {
    user: { id: USER, email: "rep@example.com" },
    profile: { id: USER, display_name: "Rep", base_role },
    org_id: ORG,
    workspace_ids: [],
    app_roles: [],
  };
}

/** Admin-client mock that records updates + audit inserts on agent_approval_queue. */
function makeAdmin(
  queueRow: {
    status: string;
    draft_body: string;
    lead_id: string;
    organization_id: string;
    ref_node_id: string | null;
  } | null,
  updateError: { message: string } | null = null,
) {
  const updates: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];

  const queueChain = {
    select: () => queueChain,
    eq: () => queueChain,
    maybeSingle: async () => ({ data: queueRow, error: null }),
    update: (row: Record<string, unknown>) => {
      updates.push(row);
      return {
        eq: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              error: updateError,
            }),
        }),
      };
    },
  };

  const client = {
    from: (table: string) => {
      if (table === "agent_approval_queue") return queueChain;
      if (table === "audit_log") {
        return {
          insert: (row: Record<string, unknown>) => {
            audits.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, updates, audits };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m.mockReset === "function") m.mockReset();
  }
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
});

describe("approveDraftOnLeadAction", () => {
  it("denies when the user lacks permission (owner check fails)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Hi",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(false);

    const r = await approveDraftOnLeadAction(QID, null);
    expect(r).toEqual({ ok: false, error: "permission" });
    expect(mocks.dispatchApprovedDraft).not.toHaveBeenCalled();
  });

  it("returns not_found when the queue row doesn't exist", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin(null);
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await approveDraftOnLeadAction(QID, null);
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(mocks.canApproveQueueItem).not.toHaveBeenCalled();
  });

  it("returns validation error when status is not pending", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "sent",
      draft_body: "Hi",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);

    const r = await approveDraftOnLeadAction(QID, null);
    expect(r).toEqual({
      ok: false,
      error: "validation",
      message: "not_pending",
    });
  });

  it("approves a clean draft and dispatches → returns sent", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Hi Rohit",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.dispatchApprovedDraft.mockResolvedValue({
      ok: true,
      status: "sent",
      provider: "mock",
      provider_message_id: "m-1",
      activity_id: "a-1",
    });

    const r = await approveDraftOnLeadAction(QID, null);
    expect(r).toEqual({ ok: true, dispatch: "sent" });
    expect(admin.updates[0]).toMatchObject({
      status: "approved",
      decided_by: USER,
    });
    // No edited_body in the update payload on a clean approve.
    expect(admin.updates[0]).not.toHaveProperty("edited_body");
    expect(admin.audits[0]).toMatchObject({
      actor_id: USER,
      organization_id: ORG,
      action: "agent_draft_approved",
      diff: { surface: "lead_canvas", edited: false },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/leads/${LEAD}`,
    );
  });

  it("approves with edited_body when the operator changed the text", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Original",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.dispatchApprovedDraft.mockResolvedValue({
      ok: true,
      status: "sent",
    });

    const r = await approveDraftOnLeadAction(QID, "Edited copy");
    expect(r).toEqual({ ok: true, dispatch: "sent" });
    expect(admin.updates[0]).toMatchObject({
      status: "approved",
      edited_body: "Edited copy",
    });
    expect(admin.audits[0].diff).toMatchObject({
      edited: true,
      original_len: 8,
      edited_len: 11,
    });
  });

  it("returns deferred when dispatch reports not_configured", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Hi",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.dispatchApprovedDraft.mockResolvedValue({
      ok: false,
      reason: "not_configured",
      message: "whatsapp",
    });

    const r = await approveDraftOnLeadAction(QID, null);
    expect(r).toEqual({
      ok: true,
      dispatch: "deferred",
      channel: "whatsapp",
    });
  });

  it("returns internal error when dispatch fails with provider_error", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Hi",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.dispatchApprovedDraft.mockResolvedValue({
      ok: false,
      reason: "provider_error",
      message: "rate limited",
    });

    const r = await approveDraftOnLeadAction(QID, null);
    expect(r).toEqual({
      ok: false,
      error: "internal",
      message: "rate limited",
    });
  });
});

describe("rejectDraftOnLeadAction", () => {
  it("denies when the user lacks permission", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Hi",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(false);

    const r = await rejectDraftOnLeadAction(QID, "wrong tone for customer");
    expect(r).toEqual({ ok: false, error: "permission" });
  });

  it("rejects a reason shorter than 3 chars", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Hi",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);

    const r = await rejectDraftOnLeadAction(QID, "no");
    expect(r).toEqual({
      ok: false,
      error: "validation",
      message: "reason_too_short",
    });
  });

  it("writes status=rejected with the trimmed reason", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "Hi",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);

    const r = await rejectDraftOnLeadAction(QID, "  Wrong tone for customer  ");
    expect(r).toEqual({ ok: true });
    expect(admin.updates[0]).toMatchObject({
      status: "rejected",
      decision_reason: "Wrong tone for customer",
      decided_by: USER,
    });
    expect(admin.audits[0]).toMatchObject({
      action: "agent_draft_rejected",
      diff: { surface: "lead_canvas", reason: "Wrong tone for customer" },
    });
  });
});

describe("confirmSiteVisitOnLeadAction", () => {
  it("denies when the user lacks permission", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: "node-1",
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(false);

    const r = await confirmSiteVisitOnLeadAction(QID, { foo: "bar" });
    expect(r).toEqual({ ok: false, error: "permission" });
    expect(mocks.confirmSiteVisitBooking).not.toHaveBeenCalled();
  });

  it("delegates to confirmSiteVisitBooking and returns assigned=true on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: "node-1",
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.confirmSiteVisitBooking.mockResolvedValue({
      ok: true,
      site_visit_id: "sv-1",
      assigned_sales_rep_id: "rep-1",
      dispatch: "sent",
    });

    const r = await confirmSiteVisitOnLeadAction(QID, { foo: "bar" });
    expect(r).toEqual({ ok: true, dispatch: "sent", assigned: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/leads/${LEAD}`,
    );
  });

  it("returns assigned=false when no project rep mapped", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: "node-1",
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.confirmSiteVisitBooking.mockResolvedValue({
      ok: true,
      site_visit_id: "sv-1",
      assigned_sales_rep_id: null,
      dispatch: "deferred",
    });

    const r = await confirmSiteVisitOnLeadAction(QID, { foo: "bar" });
    expect(r).toEqual({ ok: true, dispatch: "deferred", assigned: false });
  });

  it("maps queue_not_found error to not_found", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: "node-1",
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.confirmSiteVisitBooking.mockResolvedValue({
      ok: false,
      reason: "queue_not_found",
      message: "queue_not_found",
    });

    const r = await confirmSiteVisitOnLeadAction(QID, { foo: "bar" });
    expect(r).toMatchObject({ ok: false, error: "not_found" });
  });

  it("maps validation reason to validation error", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      status: "pending",
      draft_body: "",
      lead_id: LEAD,
      organization_id: ORG,
      ref_node_id: "node-1",
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.canApproveQueueItem.mockResolvedValue(true);
    mocks.confirmSiteVisitBooking.mockResolvedValue({
      ok: false,
      reason: "validation",
      message: "bad cab",
    });

    const r = await confirmSiteVisitOnLeadAction(QID, { foo: "bar" });
    expect(r).toMatchObject({ ok: false, error: "validation" });
  });
});
