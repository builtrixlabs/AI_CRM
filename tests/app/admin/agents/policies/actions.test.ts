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

import { setAgentPolicyAction } from "@/app/(admin)/admin/agents/policies/actions";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "44444444-2222-4333-8444-555555555555";

/** Chainable admin-client mock that records upserts + audit inserts. */
function makeAdmin() {
  const upserts: Array<{ row: Record<string, unknown>; opts: unknown }> = [];
  const auditInserts: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      if (table === "agent_message_policies") {
        return {
          upsert: (row: Record<string, unknown>, opts: unknown) => {
            upserts.push({ row, opts });
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "audit_log") {
        return {
          insert: (row: Record<string, unknown>) => {
            auditInserts.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, upserts, auditInserts };
}

function asUser(base_role: string) {
  return {
    user: { id: USER, email: "u@example.com" },
    profile: { id: USER, display_name: "U", base_role },
    org_id: ORG,
    workspace_ids: [],
    app_roles: [],
  };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m.mockReset === "function") m.mockReset();
  }
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
});

describe("setAgentPolicyAction", () => {
  it("rejects a caller without agents:manage_policies (AC-5)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("sales_rep"));
    const admin = makeAdmin();
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await setAgentPolicyAction("brochure_send", "auto_send");
    expect(r).toEqual({ ok: false, error: "permission" });
    expect(admin.upserts).toHaveLength(0);
    expect(admin.auditInserts).toHaveLength(0);
  });

  it("rejects a locked (non-configurable) agent kind", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("org_admin"));
    const admin = makeAdmin();
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await setAgentPolicyAction("site_visit_booking", "auto_send");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
    expect(admin.upserts).toHaveLength(0);
  });

  it("rejects an unknown agent kind", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("org_admin"));
    const admin = makeAdmin();
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await setAgentPolicyAction("nonsense", "auto_send");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("rejects an invalid mode", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("org_admin"));
    const admin = makeAdmin();
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await setAgentPolicyAction("brochure_send", "send_it_now");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
    expect(admin.upserts).toHaveLength(0);
  });

  it("upserts the policy + writes an audit row on success (AC-5)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("org_admin"));
    const admin = makeAdmin();
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await setAgentPolicyAction("brochure_send", "auto_send");
    expect(r).toEqual({ ok: true, mode: "auto_send" });

    expect(admin.upserts).toHaveLength(1);
    const row = admin.upserts[0].row;
    expect(row.organization_id).toBe(ORG);
    expect(row.agent_kind).toBe("brochure_send");
    expect(row.mode).toBe("auto_send");
    expect(row.updated_by).toBe(USER);
    expect(admin.upserts[0].opts).toEqual({
      onConflict: "organization_id,agent_kind",
    });

    expect(admin.auditInserts).toHaveLength(1);
    const audit = admin.auditInserts[0];
    expect(audit.action).toBe("agent_message_policy_set");
    expect(audit.table_name).toBe("agent_message_policies");
    expect(audit.organization_id).toBe(ORG);
    expect(audit.diff).toEqual({
      agent_kind: "brochure_send",
      mode: "auto_send",
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/agents/policies",
    );
  });

  it("accepts require_approval as a valid mode", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser("org_admin"));
    const admin = makeAdmin();
    mocks.getSupabaseAdmin.mockReturnValue(admin.client);

    const r = await setAgentPolicyAction(
      "follow_up_stale_lead",
      "require_approval",
    );
    expect(r).toEqual({ ok: true, mode: "require_approval" });
    expect(admin.upserts).toHaveLength(1);
  });
});
