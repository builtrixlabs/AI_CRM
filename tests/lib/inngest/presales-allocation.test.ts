import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  allocateLead: vi.fn(),
}));
vi.mock("@/lib/leads/allocation-engine", () => ({
  allocateLead: mocks.allocateLead,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));

import { presalesAllocationOnLeadCreated } from "@/lib/inngest/functions/presales-allocation";

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => unknown) => fn()),
  };
}

beforeEach(() => {
  mocks.allocateLead.mockReset();
});

describe("presalesAllocationOnLeadCreated", () => {
  it("invokes allocateLead with the event's lead/org/workspace via a step", async () => {
    mocks.allocateLead.mockResolvedValue({
      ok: true,
      outcome: "allocated",
      rule_id: "r1",
      sales_rep_id: "rep-1",
    });
    const step = makeStep();
    const result = await presalesAllocationOnLeadCreated.fn({
      event: {
        name: "lead.created",
        data: {
          lead_id: "lead-1",
          organization_id: "org-1",
          workspace_id: "ws-1",
        },
      },
      step,
    } as never);

    expect(step.run).toHaveBeenCalledTimes(1);
    expect(mocks.allocateLead).toHaveBeenCalledWith(
      { lead_id: "lead-1", organization_id: "org-1", workspace_id: "ws-1" },
      expect.anything(),
    );
    expect(result).toMatchObject({ ok: true, outcome: "allocated" });
  });

  it("propagates an unmatched allocation result", async () => {
    mocks.allocateLead.mockResolvedValue({ ok: true, outcome: "unmatched" });
    const step = makeStep();
    const result = await presalesAllocationOnLeadCreated.fn({
      event: {
        name: "lead.created",
        data: {
          lead_id: "lead-2",
          organization_id: "org-1",
          workspace_id: "ws-1",
        },
      },
      step,
    } as never);
    expect(result).toEqual({ ok: true, outcome: "unmatched" });
  });
});
