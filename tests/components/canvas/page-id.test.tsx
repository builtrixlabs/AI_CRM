// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("__NEXT_NOT_FOUND__");
  }),
  getLeadCanvas: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/canvas/api", () => ({ getLeadCanvas: mocks.getLeadCanvas }));

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

  it("returns a React element when getLeadCanvas resolves", async () => {
    mocks.getLeadCanvas.mockResolvedValue({
      lead: DEMO_LEAD,
      activities: DEMO_ACTIVITIES,
    });
    mocks.notFound.mockClear();
    const result = await LeadCanvasPage({
      params: Promise.resolve({ id: DEMO_LEAD.id }),
    });
    expect(result).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
