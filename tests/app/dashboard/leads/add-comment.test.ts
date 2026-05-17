import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
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
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { addCommentAction } from "@/app/(dashboard)/dashboard/leads/[id]/actions/add-comment";

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

function makeAdmin(opts: {
  lead?: { id: string; workspace_id: string; organization_id: string } | null;
  insertId?: string | null;
  insertError?: { message: string } | null;
}) {
  const audits: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];

  // The lead-lookup chain: from("nodes").select().eq.eq.eq.is.maybeSingle()
  const leadChain = {
    select: () => leadChain,
    eq: () => leadChain,
    is: () => leadChain,
    maybeSingle: async () => ({ data: opts.lead ?? null, error: null }),
  };

  const client = {
    from: (table: string) => {
      if (table === "nodes") {
        return {
          ...leadChain,
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            return {
              select: () => ({
                single: async () =>
                  opts.insertError
                    ? { data: null, error: opts.insertError }
                    : {
                        data: { id: opts.insertId ?? "new-comment" },
                        error: null,
                      },
              }),
            };
          },
        };
      }
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
  return { client, inserts, audits };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m.mockReset === "function") m.mockReset();
  }
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
});

describe("addCommentAction", () => {
  it("denies a user without an org", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      ...asUser(),
      org_id: null,
    });
    const r = await addCommentAction(LEAD, "hi");
    expect(r).toEqual({ ok: false, error: "permission" });
  });

  it("denies a user without notes:create (read_only role)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("read_only"));
    const r = await addCommentAction(LEAD, "hi");
    expect(r).toEqual({ ok: false, error: "permission" });
  });

  it("rejects an empty body", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const r = await addCommentAction(LEAD, "   ");
    expect(r).toEqual({
      ok: false,
      error: "validation",
      message: "empty_body",
    });
  });

  it("rejects a body longer than 4000 chars", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const r = await addCommentAction(LEAD, "x".repeat(4001));
    expect(r).toEqual({
      ok: false,
      error: "validation",
      message: "body_too_long",
    });
  });

  it("returns not_found when lead doesn't exist in this org", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({ lead: null });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);
    const r = await addCommentAction(LEAD, "hi");
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("writes a note row + audit + revalidates on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      lead: { id: LEAD, workspace_id: "ws-1", organization_id: ORG },
      insertId: "comment-xyz",
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await addCommentAction(LEAD, "Called back, no answer.");
    expect(r).toEqual({ ok: true, comment_id: "comment-xyz" });
    expect(admin.inserts[0]).toMatchObject({
      node_type: "note",
      organization_id: ORG,
      workspace_id: "ws-1",
      data: { body: "Called back, no answer.", lead_id: LEAD },
      created_by: USER,
    });
    expect(admin.audits[0]).toMatchObject({
      action: "comment_added",
      diff: { lead_id: LEAD, len: 23 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/leads/${LEAD}`,
    );
  });

  it("returns internal error when insert fails", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin({
      lead: { id: LEAD, workspace_id: "ws-1", organization_id: ORG },
      insertError: { message: "constraint violation" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await addCommentAction(LEAD, "hi");
    expect(r).toEqual({
      ok: false,
      error: "internal",
      message: "constraint violation",
    });
  });
});
