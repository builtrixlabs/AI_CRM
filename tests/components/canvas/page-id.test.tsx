// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("__NEXT_NOT_FOUND__");
  }),
  getLeadCanvas: vi.fn(),
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/canvas/api", () => ({ getLeadCanvas: mocks.getLeadCanvas }));
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveForUser: mocks.resolveForUser,
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

  it("passes canEdit/canTransition=true when user has leads:edit", async () => {
    mocks.getLeadCanvas.mockResolvedValue({
      lead: DEMO_LEAD,
      activities: DEMO_ACTIVITIES,
    });
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "u", email: "" },
      profile: { id: "u", display_name: "u", base_role: "sales_rep" },
      org_id: DEMO_LEAD.organization_id,
      workspace_ids: [DEMO_LEAD.workspace_id],
      app_roles: [],
    });
    mocks.resolveForUser.mockReturnValue(new Set(["leads:edit"]));
    const result = (await LeadCanvasPage({
      params: Promise.resolve({ id: DEMO_LEAD.id }),
    })) as {
      props: {
        children?: ReadonlyArray<{ props?: { canEdit?: boolean; canTransition?: boolean } } | unknown>;
      };
    };
    // D-321 — page now wraps LeadCanvas in a <div> containing an optional
    // PromoteToDealButton. Find the LeadCanvas element by descending into
    // the children array.
    const children = (result.props.children ?? []) as ReadonlyArray<unknown>;
    const leadCanvas = children.find(
      (c): c is { props: { canEdit: boolean; canTransition: boolean } } =>
        typeof c === "object" &&
        c !== null &&
        "props" in (c as object) &&
        typeof (c as { props: { canEdit?: unknown } }).props.canEdit === "boolean"
    );
    expect(leadCanvas?.props.canEdit).toBe(true);
    expect(leadCanvas?.props.canTransition).toBe(true);
  });
});
