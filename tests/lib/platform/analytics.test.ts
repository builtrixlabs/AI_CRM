import { describe, expect, it, vi } from "vitest";
import { getPlatformKpis } from "@/lib/platform/analytics";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";

function makeClient(opts: {
  orgs: Array<{ id: string; plan_tier: string }>;
  deals: Array<{ state: string | null }>;
  visits: Array<{ state: string | null }>;
  viq_orgs: string[];
}) {
  const orgsChain = {
    select: vi.fn(() => orgsChain),
    is: vi.fn(() => Promise.resolve({ data: opts.orgs, error: null })),
  };
  const dealsChain = {
    select: vi.fn(() => dealsChain),
    eq: vi.fn(() => dealsChain),
    is: vi.fn(() => Promise.resolve({ data: opts.deals, error: null })),
  };
  const visitsChain = {
    select: vi.fn(() => visitsChain),
    eq: vi.fn(() => visitsChain),
    is: vi.fn(() => visitsChain),
    gte: vi.fn(() => Promise.resolve({ data: opts.visits, error: null })),
  };
  const viqChain = {
    select: vi.fn(() => viqChain),
    eq: vi.fn(() =>
      Promise.resolve({
        data: opts.viq_orgs.map((id) => ({ organization_id: id })),
        error: null,
      })
    ),
  };

  let nodesCall = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === "organizations") return orgsChain;
      if (table === "nodes") {
        const idx = nodesCall++;
        return idx === 0 ? dealsChain : visitsChain;
      }
      if (table === "org_integration_secrets") return viqChain;
      throw new Error(`unexpected ${table}`);
    }),
  };
}

describe("getPlatformKpis", () => {
  it("returns zeroed kpis for an empty platform", async () => {
    const client = makeClient({
      orgs: [],
      deals: [],
      visits: [],
      viq_orgs: [],
    });
    const k = await getPlatformKpis(client as never);
    expect(k.total_orgs).toBe(0);
    expect(k.orgs_by_plan_tier).toEqual({
      starter: 0,
      professional: 0,
      enterprise: 0,
      custom: 0,
    });
    expect(k.conversion.rate_pct).toBe(0);
    expect(k.site_visits_30d.total).toBe(0);
    expect(k.voice_iq_adoption.rate_pct).toBe(0);
  });

  it("rolls up tiers, conversion, visits, viq adoption", async () => {
    const client = makeClient({
      orgs: [
        { id: ORG_A, plan_tier: "professional" },
        { id: ORG_B, plan_tier: "starter" },
      ],
      deals: [
        { state: "qualified" },
        { state: "qualified" },
        { state: "site_visit_scheduled" },
        { state: "negotiation" },
        { state: "booked" },
        { state: "lost" }, // outside funnel
      ],
      visits: [
        { state: "scheduled" },
        { state: "scheduled" },
        { state: "confirmed" },
        { state: "no_show" },
        { state: "completed" },
      ],
      viq_orgs: [ORG_A], // 1 of 2 orgs has voice_iq
    });
    const k = await getPlatformKpis(client as never);
    expect(k.total_orgs).toBe(2);
    expect(k.orgs_by_plan_tier.professional).toBe(1);
    expect(k.orgs_by_plan_tier.starter).toBe(1);
    expect(k.conversion.qualified_or_later).toBe(5);
    expect(k.conversion.booked).toBe(1);
    expect(k.conversion.rate_pct).toBeCloseTo(20, 5);
    expect(k.site_visits_30d).toEqual({
      scheduled: 2,
      confirmed: 1,
      completed: 1,
      no_show: 1,
      total: 5,
    });
    expect(k.voice_iq_adoption.orgs_with_voice_iq).toBe(1);
    expect(k.voice_iq_adoption.rate_pct).toBe(50);
  });

  it("ignores unknown deal states and unknown plan tiers", async () => {
    const client = makeClient({
      orgs: [{ id: ORG_A, plan_tier: "garbage" }],
      deals: [{ state: "unknown" }, { state: "booked" }],
      visits: [],
      viq_orgs: [],
    });
    const k = await getPlatformKpis(client as never);
    expect(k.total_orgs).toBe(1);
    // garbage tier doesn't bump any bucket
    expect(k.orgs_by_plan_tier).toEqual({
      starter: 0,
      professional: 0,
      enterprise: 0,
      custom: 0,
    });
    // booked counted in qualified_or_later AND in booked → 100% conversion
    expect(k.conversion.qualified_or_later).toBe(1);
    expect(k.conversion.booked).toBe(1);
    expect(k.conversion.rate_pct).toBe(100);
  });
});
