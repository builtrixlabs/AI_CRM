import { describe, expect, it, vi } from "vitest";
import { checkAgentBudget, TIER_DEFAULT_BUDGET } from "@/lib/agents/budget";

function makeClient(opts: {
  monthly_token_budget: number | null | undefined; // undefined = no row
  plan_tier?: string;
  usage?: number;
  cfg_error?: boolean;
  usage_error?: boolean;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "agent_org_configs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve(
                  opts.cfg_error
                    ? { data: null, error: { message: "boom-cfg" } }
                    : { data: opts.monthly_token_budget === undefined ? null : { monthly_token_budget: opts.monthly_token_budget }, error: null },
                )),
              })),
            })),
          })),
        };
      }
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { plan_tier: opts.plan_tier ?? "starter" }, error: null })),
            })),
          })),
        };
      }
      return { select: vi.fn() };
    }),
    rpc: vi.fn(() => Promise.resolve(
      opts.usage_error
        ? { data: null, error: { message: "boom-usage" } }
        : { data: opts.usage ?? 0, error: null },
    )),
  };
}

describe("checkAgentBudget", () => {
  it("returns ok with remaining when under cap (org override)", async () => {
    const c = makeClient({ monthly_token_budget: 50_000, usage: 12_345 });
    const r = await checkAgentBudget("org-1", "follow_up", c as never);
    expect(r).toEqual({ ok: true, cap: 50_000, usage: 12_345, remaining: 37_655 });
  });

  it("uses plan-tier default when org override is null", async () => {
    const c = makeClient({ monthly_token_budget: null, plan_tier: "professional", usage: 0 });
    const r = await checkAgentBudget("org-1", "follow_up", c as never);
    if (!r.ok) throw new Error("expected ok");
    expect(r.cap).toBe(TIER_DEFAULT_BUDGET.professional);
  });

  it("uses starter default when no agent_org_config row exists", async () => {
    const c = makeClient({ monthly_token_budget: undefined, plan_tier: "starter", usage: 0 });
    const r = await checkAgentBudget("org-1", "follow_up", c as never);
    if (!r.ok) throw new Error("expected ok");
    expect(r.cap).toBe(TIER_DEFAULT_BUDGET.starter);
  });

  it("returns over_budget when usage >= cap", async () => {
    const c = makeClient({ monthly_token_budget: 1000, usage: 1000 });
    const r = await checkAgentBudget("org-1", "follow_up", c as never);
    expect(r).toEqual({ ok: false, error: "over_budget", usage: 1000, cap: 1000 });
  });

  it("returns over_budget when cap is 0 (custom-tier with no override)", async () => {
    const c = makeClient({ monthly_token_budget: null, plan_tier: "custom", usage: 0 });
    const r = await checkAgentBudget("org-1", "follow_up", c as never);
    expect(r).toEqual({ ok: false, error: "over_budget", usage: 0, cap: 0 });
  });

  it("treats cfg lookup error as lookup_failed (fail-closed)", async () => {
    const c = makeClient({ monthly_token_budget: null, cfg_error: true });
    const r = await checkAgentBudget("org-1", "follow_up", c as never);
    expect(r).toEqual({ ok: false, error: "lookup_failed" });
  });

  it("treats usage lookup error as lookup_failed", async () => {
    const c = makeClient({ monthly_token_budget: 100, usage_error: true });
    const r = await checkAgentBudget("org-1", "follow_up", c as never);
    expect(r).toEqual({ ok: false, error: "lookup_failed" });
  });
});
