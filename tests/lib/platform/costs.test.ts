import { describe, expect, it, vi } from "vitest";
import { getOrgCosts } from "@/lib/platform/costs";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";

function makeClient(opts: {
  orgs: Array<{ id: string; slug: string; name: string; plan_tier: string }>;
  tokens: Array<{
    organization_id: string | null;
    tokens_in: number;
    tokens_out: number;
  }>;
  api_calls: Array<{ organization_id: string | null }>;
}) {
  const orgChain = {
    select: vi.fn(() => orgChain),
    is: vi.fn(() => orgChain),
    order: vi.fn(() => Promise.resolve({ data: opts.orgs, error: null })),
  };
  const tokensChain = {
    select: vi.fn(() => tokensChain),
    gte: vi.fn(() => Promise.resolve({ data: opts.tokens, error: null })),
  };
  const apiChain = {
    select: vi.fn(() => apiChain),
    gte: vi.fn(() => Promise.resolve({ data: opts.api_calls, error: null })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "organizations") return orgChain;
      if (table === "token_usage_ledger") return tokensChain;
      if (table === "api_audit_log") return apiChain;
      throw new Error(`unexpected ${table}`);
    }),
  };
}

describe("getOrgCosts", () => {
  it("rolls up tokens + api calls per org with 30-day window", async () => {
    const client = makeClient({
      orgs: [
        { id: ORG_A, slug: "a", name: "Alpha", plan_tier: "professional" },
        { id: ORG_B, slug: "b", name: "Bravo", plan_tier: "starter" },
      ],
      tokens: [
        { organization_id: ORG_A, tokens_in: 1000, tokens_out: 500 },
        { organization_id: ORG_A, tokens_in: 200, tokens_out: 100 },
        { organization_id: ORG_B, tokens_in: 50, tokens_out: 10 },
        { organization_id: null, tokens_in: 999, tokens_out: 999 }, // ignored
      ],
      api_calls: [
        { organization_id: ORG_A },
        { organization_id: ORG_A },
        { organization_id: ORG_A },
        { organization_id: ORG_B },
      ],
    });
    const summary = await getOrgCosts(client as never);

    const byId = new Map(summary.rows.map((r) => [r.organization_id, r]));
    const a = byId.get(ORG_A)!;
    expect(a.tokens_in_30d).toBe(1200);
    expect(a.tokens_out_30d).toBe(600);
    expect(a.api_calls_30d).toBe(3);

    const b = byId.get(ORG_B)!;
    expect(b.tokens_in_30d).toBe(50);
    expect(b.tokens_out_30d).toBe(10);
    expect(b.api_calls_30d).toBe(1);

    expect(summary.totals).toEqual({
      total_orgs: 2,
      total_tokens_in_30d: 1250,
      total_tokens_out_30d: 610,
      total_api_calls_30d: 4,
    });
  });

  it("returns empty totals when no orgs", async () => {
    const client = makeClient({ orgs: [], tokens: [], api_calls: [] });
    const summary = await getOrgCosts(client as never);
    expect(summary.rows).toEqual([]);
    expect(summary.totals.total_orgs).toBe(0);
  });

  it("handles missing tokens / api_calls gracefully (zeros, not nulls)", async () => {
    const client = makeClient({
      orgs: [{ id: ORG_A, slug: "a", name: "Alpha", plan_tier: "starter" }],
      tokens: [],
      api_calls: [],
    });
    const summary = await getOrgCosts(client as never);
    expect(summary.rows[0].tokens_in_30d).toBe(0);
    expect(summary.rows[0].api_calls_30d).toBe(0);
  });
});
