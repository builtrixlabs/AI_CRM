import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  transitionLead: vi.fn(),
  addCommentAction: vi.fn(),
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

// transitionLead is re-exported from @/lib/leads (and its module file). Mock
// the barrel; the action imports the IllegalTransitionError class to type-
// check the catch branch, so re-export it too.
vi.mock("@/lib/leads", async () => {
  const real = await vi.importActual<typeof import("@/lib/leads")>(
    "@/lib/leads",
  );
  return {
    ...real,
    transitionLead: mocks.transitionLead,
  };
});

vi.mock("@/app/(dashboard)/dashboard/leads/[id]/actions/add-comment", () => ({
  addCommentAction: mocks.addCommentAction,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { quickActionAction } from "@/app/(dashboard)/dashboard/leads/[id]/actions/quick-action";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-2222-4333-8444-555555555555";
const LEAD = "33333333-2222-4333-8444-555555555555";

function asUser(base_role = "sales_rep") {
  return {
    user: { id: USER, email: "u@example.com" },
    profile: { id: USER, display_name: "U", base_role },
    org_id: ORG,
    workspace_ids: [],
    app_roles: [],
  };
}

function makeAdmin(
  lead: {
    id: string;
    state: string;
    organization_id: string;
    workspace_id: string;
    data: Record<string, unknown>;
  } | null,
  updateError: { message: string } | null = null,
) {
  const updates: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];

  const leadChain = {
    select: () => leadChain,
    eq: () => leadChain,
    is: () => leadChain,
    maybeSingle: async () => ({ data: lead, error: null }),
    update: (row: Record<string, unknown>) => {
      updates.push(row);
      return {
        eq: () => ({
          eq: () =>
            Promise.resolve({ data: null, error: updateError }),
        }),
      };
    },
  };

  const client = {
    from: (table: string) => {
      if (table === "nodes") return leadChain;
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

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m.mockReset === "function") m.mockReset();
  }
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
});

describe("quickActionAction — validation", () => {
  it("denies a user without leads:edit", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("read_only"));
    const r = await quickActionAction(LEAD, { comment: "hi" });
    expect(r).toEqual({ ok: false, error: "permission" });
  });

  it("rejects a no-op (all three fields empty)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const r = await quickActionAction(LEAD, {});
    expect(r).toMatchObject({
      ok: false,
      error: "validation",
      step: "validate",
      message: "no_fields",
    });
  });

  it("rejects a past follow-up date", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const r = await quickActionAction(LEAD, { follow_up_on: PAST });
    expect(r).toMatchObject({
      ok: false,
      error: "validation",
      message: "follow_up_not_future",
    });
  });

  it("rejects an unknown target_state", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const r = await quickActionAction(LEAD, {
      target_state: "weird" as never,
    });
    expect(r).toMatchObject({
      ok: false,
      error: "validation",
      message: "invalid_target_state",
    });
  });

  it("rejects an illegal state transition (terminal → anything)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      id: LEAD,
      state: "lost",
      organization_id: ORG,
      workspace_id: "ws-1",
      data: {},
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await quickActionAction(LEAD, { target_state: "qualified" });
    expect(r).toMatchObject({
      ok: false,
      error: "validation",
      step: "validate",
    });
    expect(mocks.transitionLead).not.toHaveBeenCalled();
  });

  it("rejects a terminal transition without a reason", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      id: LEAD,
      state: "contacted",
      organization_id: ORG,
      workspace_id: "ws-1",
      data: {},
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await quickActionAction(LEAD, { target_state: "lost" });
    expect(r).toMatchObject({
      ok: false,
      error: "validation",
      step: "validate",
      message: "reason_required_for_terminal",
    });
  });
});

describe("quickActionAction — happy path", () => {
  it("writes comment + state + follow-up atomically (all three)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      id: LEAD,
      state: "contacted",
      organization_id: ORG,
      workspace_id: "ws-1",
      data: { phone: "+91" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.addCommentAction.mockResolvedValue({
      ok: true,
      comment_id: "comment-1",
    });
    mocks.transitionLead.mockResolvedValue(undefined);

    const r = await quickActionAction(LEAD, {
      comment: "Just spoke",
      target_state: "qualified",
      follow_up_on: FUTURE,
    });
    expect(r).toEqual({
      ok: true,
      comment_id: "comment-1",
      state_changed: true,
      follow_up_set: true,
    });
    expect(mocks.addCommentAction).toHaveBeenCalledWith(LEAD, "Just spoke");
    expect(mocks.transitionLead).toHaveBeenCalled();
    // Follow-up update payload preserves prior data + adds follow_up_on.
    expect(admin.updates[0]).toMatchObject({
      data: { phone: "+91", follow_up_on: FUTURE },
      updated_by: USER,
    });
    expect(admin.audits[0]).toMatchObject({
      action: "follow_up_scheduled",
      diff: { follow_up_on: FUTURE },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/leads/${LEAD}`,
    );
  });

  it("comment-only run skips state + follow-up steps", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      id: LEAD,
      state: "new",
      organization_id: ORG,
      workspace_id: "ws-1",
      data: {},
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.addCommentAction.mockResolvedValue({
      ok: true,
      comment_id: "c-1",
    });

    const r = await quickActionAction(LEAD, { comment: "Note only" });
    expect(r).toEqual({
      ok: true,
      comment_id: "c-1",
      state_changed: false,
      follow_up_set: false,
    });
    expect(mocks.transitionLead).not.toHaveBeenCalled();
    expect(admin.updates).toHaveLength(0);
  });

  it("aborts before state write when comment fails", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      id: LEAD,
      state: "contacted",
      organization_id: ORG,
      workspace_id: "ws-1",
      data: {},
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    mocks.addCommentAction.mockResolvedValue({
      ok: false,
      error: "internal",
      message: "db down",
    });

    const r = await quickActionAction(LEAD, {
      comment: "x",
      target_state: "qualified",
    });
    expect(r).toMatchObject({
      ok: false,
      error: "internal",
      step: "comment",
    });
    expect(mocks.transitionLead).not.toHaveBeenCalled();
  });
});
