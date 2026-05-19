// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("__NEXT_NOT_FOUND__");
  }),
  getLeadCanvas: vi.fn(),
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }),
  })),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/canvas/api", () => ({ getLeadCanvas: mocks.getLeadCanvas }));
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveForUser: mocks.resolveForUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));
vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  createLeadAction: vi.fn(),
  updateLeadAction: vi.fn(),
  transitionLeadAction: vi.fn(),
  promoteLeadToDealAction: vi.fn(),
}));
// D-020 — CustomFieldsBlock pulls in service-role admin client, mock it here.
vi.mock("@/components/canvas/custom-fields-block", () => ({
  CustomFieldsBlock: () => null,
}));

import LeadCanvasPage from "@/app/(dashboard)/dashboard/leads/[id]/page";
import { DEMO_ACTIVITIES, DEMO_LEAD } from "@/lib/canvas/fixture";

type WorkspaceProps = {
  canEdit?: boolean;
  canTransition?: boolean;
  canCall?: boolean;
  canPromoteToDeal?: boolean;
  canScheduleVisit?: boolean;
};

describe("/dashboard/leads/[id]", () => {
  it("calls notFound() when getLeadCanvas returns null", async () => {
    mocks.getLeadCanvas.mockResolvedValue(null);
    mocks.notFound.mockClear();
    await expect(
      LeadCanvasPage({ params: Promise.resolve({ id: "missing-id" }) }),
    ).rejects.toThrow(/__NEXT_NOT_FOUND__/);
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getLeadCanvas).toHaveBeenCalledWith("missing-id");
  });

  it("returns a React element when getLeadCanvas resolves (no perms)", async () => {
    mocks.getLeadCanvas.mockResolvedValue({
      lead: DEMO_LEAD,
      activities: DEMO_ACTIVITIES,
    });
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.notFound.mockClear();
    const result = await LeadCanvasPage({
      params: Promise.resolve({ id: DEMO_LEAD.id }),
    });
    expect(result).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("passes the resolved perm bundle to LeadWorkspace", async () => {
    mocks.getLeadCanvas.mockResolvedValue({
      lead: DEMO_LEAD,
      activities: DEMO_ACTIVITIES,
    });
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "u", email: "" },
      profile: { id: "u", display_name: "u", base_role: "sales_rep", phone: null },
      org_id: DEMO_LEAD.organization_id,
      workspace_ids: [DEMO_LEAD.workspace_id],
      app_roles: [],
    });
    mocks.resolveForUser.mockReturnValue(
      new Set([
        "leads:edit",
        "deals:create",
        "calls:listen",
        "site_visits:view",
      ]),
    );
    const result = (await LeadCanvasPage({
      params: Promise.resolve({ id: DEMO_LEAD.id }),
    })) as { props: WorkspaceProps };
    expect(result.props.canEdit).toBe(true);
    expect(result.props.canTransition).toBe(true);
    expect(result.props.canCall).toBe(true);
    expect(result.props.canPromoteToDeal).toBe(true);
    expect(result.props.canScheduleVisit).toBe(true);
  });

  it("denies the action perms when the user lacks them", async () => {
    mocks.getLeadCanvas.mockResolvedValue({
      lead: DEMO_LEAD,
      activities: DEMO_ACTIVITIES,
    });
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "u", email: "" },
      profile: { id: "u", display_name: "u", base_role: "read_only", phone: null },
      org_id: DEMO_LEAD.organization_id,
      workspace_ids: [DEMO_LEAD.workspace_id],
      app_roles: [],
    });
    mocks.resolveForUser.mockReturnValue(new Set());
    const result = (await LeadCanvasPage({
      params: Promise.resolve({ id: DEMO_LEAD.id }),
    })) as { props: WorkspaceProps };
    expect(result.props.canEdit).toBe(false);
    expect(result.props.canTransition).toBe(false);
    expect(result.props.canCall).toBe(false);
    expect(result.props.canPromoteToDeal).toBe(false);
    expect(result.props.canScheduleVisit).toBe(false);
  });
});
