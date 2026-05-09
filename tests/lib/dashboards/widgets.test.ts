import { describe, expect, it, vi } from "vitest";
import {
  fetchActiveUsersCount,
  fetchAgentStatus,
  fetchBookingPipeline,
  fetchDirectiveFires24h,
  fetchLeadCountByState,
  fetchRecentLeads,
  fetchWidgetData,
} from "@/lib/dashboards/widgets";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeClient(handlers: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => {
      if (handlers[table] === undefined) {
        throw new Error(`unhandled: ${table}`);
      }
      return handlers[table];
    }),
  } as unknown as Parameters<typeof fetchLeadCountByState>[1];
}

describe("fetchLeadCountByState", () => {
  it("counts leads per state, filling zeros for unobserved", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() =>
        Promise.resolve({
          data: [
            { state: "new" },
            { state: "new" },
            { state: "qualified" },
          ],
          error: null,
        }),
      ),
    };
    const c = makeClient({ nodes: chain });
    const result = await fetchLeadCountByState(ORG, c);
    const map = new Map(result.map((r) => [r.state, r.count]));
    expect(map.get("new")).toBe(2);
    expect(map.get("qualified")).toBe(1);
    expect(map.get("contacted")).toBe(0);
  });
});

describe("fetchDirectiveFires24h", () => {
  it("groups outcomes into the standard buckets", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() =>
        Promise.resolve({
          data: [
            { outcome: "dispatched" },
            { outcome: "dispatched" },
            { outcome: "rate_limited" },
            { outcome: "pending_approval" },
            { outcome: "error" },
            { outcome: "skipped_disabled" },
          ],
          error: null,
        }),
      ),
    };
    const c = makeClient({ directive_invocations: chain });
    const r = await fetchDirectiveFires24h(ORG, c);
    expect(r.total).toBe(6);
    expect(r.dispatched).toBe(2);
    expect(r.rate_limited).toBe(1);
    expect(r.pending_approval).toBe(1);
    expect(r.errored).toBe(1);
  });
});

describe("fetchActiveUsersCount", () => {
  it("returns the count from a head query", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => Promise.resolve({ count: 5, error: null })),
    };
    const c = makeClient({ profiles: chain });
    const r = await fetchActiveUsersCount(ORG, c);
    expect(r.count).toBe(5);
  });
});

describe("fetchRecentLeads", () => {
  it("returns leads ordered by created_at desc", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              id: "l1",
              label: "+91-9999",
              state: "new",
              created_at: "2026-05-09",
            },
          ],
          error: null,
        }),
      ),
    };
    const c = makeClient({ nodes: chain });
    const r = await fetchRecentLeads(ORG, c);
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe("+91-9999");
  });
});

describe("fetchAgentStatus", () => {
  it("aggregates registry count + provisioned/suspended", async () => {
    const registryChain = {
      select: vi.fn(() => Promise.resolve({ count: 3, error: null })),
    };
    const configsChain = {
      select: vi.fn(() => configsChain),
      eq: vi.fn(() => configsChain),
      is: vi.fn(() =>
        Promise.resolve({
          data: [{ enabled: true }, { enabled: false }],
          error: null,
        }),
      ),
    };
    const c = makeClient({
      agent_service_accounts: registryChain,
      agent_org_configs: configsChain,
    });
    const r = await fetchAgentStatus(ORG, c);
    expect(r.total_registered).toBe(3);
    expect(r.provisioned).toBe(2);
    expect(r.suspended).toBe(1);
  });
});

describe("fetchBookingPipeline (D-224)", () => {
  it("returns 5 zero-stages when org has no deals", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    const c = makeClient({ nodes: chain });
    const r = await fetchBookingPipeline(ORG, c);
    expect(r.stages).toHaveLength(5);
    expect(r.total_at_top).toBe(0);
    expect(r.conversion_rate_overall).toBe(0);
    for (const s of r.stages) expect(s.count).toBe(0);
  });

  it("tallies deal states into the funnel and computes conversion", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() =>
        Promise.resolve({
          data: [
            { state: "qualified" },
            { state: "qualified" },
            { state: "qualified" },
            { state: "qualified" },
            { state: "site_visit_scheduled" },
            { state: "site_visit_done" },
            { state: "negotiation" },
            { state: "booked" },
            { state: "lost" }, // outside funnel — ignored
          ],
          error: null,
        }),
      ),
    };
    const c = makeClient({ nodes: chain });
    const r = await fetchBookingPipeline(ORG, c);
    const map = new Map(r.stages.map((s) => [s.key, s.count]));
    expect(map.get("qualified")).toBe(4);
    expect(map.get("site_visit_scheduled")).toBe(1);
    expect(map.get("site_visit_done")).toBe(1);
    expect(map.get("negotiation")).toBe(1);
    expect(map.get("booked")).toBe(1);
    expect(r.total_at_top).toBe(4);
    // 1 booked / 4 qualified = 0.25
    expect(r.conversion_rate_overall).toBeCloseTo(0.25, 5);
  });
});

describe("fetchWidgetData dispatcher", () => {
  it("routes to the correct fetcher", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => Promise.resolve({ count: 7, error: null })),
    };
    const c = makeClient({ profiles: chain });
    const r = await fetchWidgetData("active_users_count", ORG, c);
    expect(r.count).toBe(7);
  });
});
