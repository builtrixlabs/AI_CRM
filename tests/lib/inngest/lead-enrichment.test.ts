import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrichLead: vi.fn(),
  agentRow: { id: "00000000-0000-4000-8000-000000000aaa" } as
    | { id: string }
    | null,
}));

vi.mock("@/lib/agents/lead-enrichment", () => ({
  enrichLead: mocks.enrichLead,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: mocks.agentRow, error: null }),
      };
      return chain;
    },
  }),
}));

import { leadEnrichmentOnCreate } from "@/lib/inngest/functions/lead-enrichment";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => unknown) => {
      return await fn();
    }),
  };
}

describe("leadEnrichmentOnCreate", () => {
  it("dispatches to enrichLead with the agent_id resolved from the registry", async () => {
    mocks.enrichLead.mockResolvedValue({
      ok: true,
      tier: "T1",
      audit_log_id: "audit-1",
      output: { score: 80 },
    });
    const step = makeStep();
    const result = await leadEnrichmentOnCreate.fn({
      event: {
        name: "lead.created",
        data: { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
      },
      step,
    } as never);
    expect(result).toEqual({
      ok: true,
      tier: "T1",
      audit_log_id: "audit-1",
      output: { score: 80 },
    });
    // Two step.run calls: resolve-agent + enrich.
    expect(step.run).toHaveBeenCalledTimes(2);
    expect(mocks.enrichLead).toHaveBeenCalledOnce();
    const args = mocks.enrichLead.mock.calls[0]![0];
    expect(args.agent_id).toBe("00000000-0000-4000-8000-000000000aaa");
    expect(args.lead_id).toBe(LEAD);
    expect(args.organization_id).toBe(ORG);
    expect(args.workspace_id).toBe(WS);
    expect(args.attempted_tier).toBe("T1");
  });

  it("surfaces enrichLead's error result through Inngest", async () => {
    mocks.enrichLead.mockResolvedValue({
      ok: false,
      error: "gateway",
      message: "rate limit",
    });
    const step = makeStep();
    const result = await leadEnrichmentOnCreate.fn({
      event: {
        name: "lead.created",
        data: { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
      },
      step,
    } as never);
    expect(result).toEqual({
      ok: false,
      error: "gateway",
      message: "rate limit",
    });
  });

  it("throws when the agent service-account row is missing", async () => {
    const restore = mocks.agentRow;
    mocks.agentRow = null;
    try {
      const step = makeStep();
      await expect(
        leadEnrichmentOnCreate.fn({
          event: {
            name: "lead.created",
            data: { lead_id: LEAD, organization_id: ORG, workspace_id: WS },
          },
          step,
        } as never),
      ).rejects.toThrow(/service-account row missing/i);
    } finally {
      mocks.agentRow = restore;
    }
  });
});
