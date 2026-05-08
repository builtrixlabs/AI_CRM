import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
  createLead: vi.fn(),
  transitionLead: vi.fn(),
  updateNodeData: vi.fn(),
  fetchNodeForUpdate: vi.fn(),
  revalidatePath: vi.fn(),
  /** Toggle for the in-tenant pre-check in updateLeadAction. */
  tenantCheckRow: null as { workspace_id: string } | null,
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<object>("@/lib/auth/permissions");
  return {
    ...actual,
    resolveForUser: mocks.resolveForUser,
  };
});
vi.mock("@/lib/leads/api", () => ({
  createLead: mocks.createLead,
  transitionLead: mocks.transitionLead,
}));
vi.mock("@/lib/nodes/api", () => ({
  updateNodeData: mocks.updateNodeData,
  NodeValidationError: class NodeValidationError extends Error {
    constructor(public readonly issues: { path: (string | number)[]; message: string }[]) {
      super("NodeValidationError");
      this.name = "NodeValidationError";
    }
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  // assertLeadInTenant uses this; we return a chain whose final maybeSingle()
  // resolves to mocks.tenantCheckRow.
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: mocks.tenantCheckRow, error: null }),
      };
      return chain;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createLeadAction,
  updateLeadAction,
  transitionLeadAction,
} from "@/app/(dashboard)/dashboard/_actions/leads";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const USER = "33333333-4444-4555-8666-777777777777";
const LEAD = "44444444-5555-4666-8777-888888888888";

const SIGNED_IN_USER = {
  user: { id: USER, email: "rep@example.com" },
  profile: { id: USER, display_name: "Rep", base_role: "sales_rep" },
  org_id: ORG,
  workspace_ids: [WS],
  app_roles: [],
};

beforeEach(() => {
  for (const k of Object.keys(mocks) as (keyof typeof mocks)[]) {
    const m = mocks[k];
    if (
      m != null &&
      typeof (m as { mockReset?: unknown }).mockReset === "function"
    ) {
      (m as { mockReset: () => void }).mockReset();
    }
  }
  mocks.getCurrentUser.mockResolvedValue(SIGNED_IN_USER);
  mocks.resolveForUser.mockReturnValue(
    new Set(["leads:create", "leads:edit", "leads:view"]),
  );
  // Default: tenant check passes (lead is in caller's org).
  mocks.tenantCheckRow = { workspace_id: WS };
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("createLeadAction", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const r = await createLeadAction(fd({ phone: "+91-9000000000", source: "walkin" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("returns 403 when user lacks leads:create", async () => {
    mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
    const r = await createLeadAction(fd({ phone: "+91-9000000000", source: "walkin" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("returns validation errors on bad input", async () => {
    const r = await createLeadAction(fd({ phone: "12", source: "walkin" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.fieldErrors?.phone).toBeTruthy();
    }
  });

  it("returns validation error when user has no workspace", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      ...SIGNED_IN_USER,
      workspace_ids: [],
    });
    const r = await createLeadAction(fd({ phone: "+91-9000000000", source: "walkin" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("happy path: calls createLead and returns the new id", async () => {
    mocks.createLead.mockResolvedValue({ id: LEAD });
    const r = await createLeadAction(
      fd({
        phone: "+91-9876543210",
        source: "magicbricks",
        email: "p@example.com",
        notes: "first call",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.id).toBe(LEAD);
    expect(mocks.createLead).toHaveBeenCalledOnce();
    const args = mocks.createLead.mock.calls[0]![0];
    expect(args.organization_id).toBe(ORG);
    expect(args.workspace_id).toBe(WS);
    expect(args.created_by).toBe(USER);
    expect(args.data).toEqual({
      phone: "+91-9876543210",
      source: "magicbricks",
      email: "p@example.com",
      notes: "first call",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});

describe("updateLeadAction", () => {
  it("returns 403 when user lacks leads:edit", async () => {
    mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
    const r = await updateLeadAction(LEAD, fd({ notes: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("rejects malformed lead_id", async () => {
    const r = await updateLeadAction("not-a-uuid", fd({ notes: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("rejects unknown source", async () => {
    const r = await updateLeadAction(LEAD, fd({ source: "linkedin" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.fieldErrors?.source).toBeTruthy();
    }
  });

  it("cross-tenant: returns 'Lead not found' (no existence leak) when tenant check fails", async () => {
    mocks.tenantCheckRow = null; // pre-check returns no row
    const r = await updateLeadAction(LEAD, fd({ notes: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toBe("Lead not found");
    }
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
  });

  it("happy path: dispatches to updateNodeData with merged partial", async () => {
    mocks.updateNodeData.mockResolvedValue(undefined);
    const r = await updateLeadAction(
      LEAD,
      fd({ notes: "follow-up scheduled", email: "p2@example.com" }),
    );
    expect(r.ok).toBe(true);
    expect(mocks.updateNodeData).toHaveBeenCalledOnce();
    const args = mocks.updateNodeData.mock.calls[0]![0];
    expect(args.id).toBe(LEAD);
    expect(args.partial).toEqual({
      notes: "follow-up scheduled",
      email: "p2@example.com",
    });
    expect(args.updated_by).toBe(USER);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/dashboard/leads/${LEAD}`);
  });

  it("ignores empty fields (treats as missing for partial update)", async () => {
    mocks.updateNodeData.mockResolvedValue(undefined);
    await updateLeadAction(LEAD, fd({ notes: "  ", email: "p@example.com" }));
    const args = mocks.updateNodeData.mock.calls[0]![0];
    expect(args.partial).toEqual({ email: "p@example.com" });
  });
});

describe("transitionLeadAction", () => {
  it("returns 403 when user lacks leads:edit", async () => {
    mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "contacted" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("rejects illegal target_state via Zod", async () => {
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "negotiation" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("rejects terminal target without reason", async () => {
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "lost" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.fieldErrors?.reason).toBeTruthy();
    }
  });

  it("happy forward transition dispatches to transitionLead with caller_org_id", async () => {
    mocks.transitionLead.mockResolvedValue(undefined);
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "contacted" }),
    );
    expect(r.ok).toBe(true);
    expect(mocks.transitionLead).toHaveBeenCalledOnce();
    const args = mocks.transitionLead.mock.calls[0]![0];
    expect(args.lead_id).toBe(LEAD);
    expect(args.target_state).toBe("contacted");
    expect(args.actor).toBe(USER);
    expect(args.caller_org_id).toBe(ORG);
    expect(args.reason).toBeUndefined();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/dashboard/leads/${LEAD}`);
  });

  it("cross-tenant: maps 'Lead not found' from helper to validation error", async () => {
    mocks.transitionLead.mockRejectedValue(
      new Error("Lead not found or not visible: " + LEAD),
    );
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "contacted" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toBe("Lead not found");
    }
  });

  it("happy terminal transition with reason dispatches to transitionLead", async () => {
    mocks.transitionLead.mockResolvedValue(undefined);
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "lost", reason: "duplicate" }),
    );
    expect(r.ok).toBe(true);
    const args = mocks.transitionLead.mock.calls[0]![0];
    expect(args.target_state).toBe("lost");
    expect(args.reason).toBe("duplicate");
  });

  it("maps IllegalTransitionError to validation error", async () => {
    const { IllegalTransitionError } = await import("@/lib/leads/transitions");
    mocks.transitionLead.mockRejectedValue(
      new IllegalTransitionError("lost", "new"),
    );
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "new" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("maps generic transition error (not 'not found') to unknown error", async () => {
    mocks.transitionLead.mockRejectedValue(new Error("db connection lost"));
    const r = await transitionLeadAction(
      fd({ lead_id: LEAD, target_state: "contacted" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unknown");
  });
});
