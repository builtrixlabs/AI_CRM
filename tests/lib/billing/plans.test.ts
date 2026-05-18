import { describe, expect, it, vi } from "vitest";
import { getPlan, listPlans } from "@/lib/billing/plans";

function makeClient(opts: {
  list_data?: unknown[] | null;
  list_error?: { message: string } | null;
  get_data?: unknown | null;
  get_error?: { message: string } | null;
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => {
          const orderable = {
            order: vi.fn(() =>
              Promise.resolve({
                data: opts.list_data ?? null,
                error: opts.list_error ?? null,
              })
            ),
          };
          const eqable = {
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data: opts.get_data ?? null,
                    error: opts.get_error ?? null,
                  })
                ),
              })),
            })),
            ...orderable,
          };
          return eqable;
        }),
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({
                data: opts.get_data ?? null,
                error: opts.get_error ?? null,
              })
            ),
          })),
        })),
      })),
    })),
  };
}

describe("plans.listPlans", () => {
  it("returns DB rows when SELECT succeeds", async () => {
    const c = makeClient({
      list_data: [
        {
          tier: "starter",
          display_name: "Starter",
          monthly_price_inr: 0,
          monthly_price_usd: null,
          stripe_price_id: null,
          max_users: 5,
          max_active_properties: 1,
          max_bookings_per_month: 50,
          max_channel_partners: 5,
          features: ["a"],
        },
      ],
    });
    const r = await listPlans(c as never);
    expect(r).toHaveLength(1);
    expect(r[0].tier).toBe("starter");
  });

  it("falls back to constants when SELECT returns error", async () => {
    const c = makeClient({ list_error: { message: "db" } });
    const r = await listPlans(c as never);
    const tiers = r.map((p) => p.tier).sort();
    expect(tiers).toEqual(["custom", "enterprise", "professional", "starter"]);
  });
});

describe("plans.getPlan", () => {
  it("returns DB row when present", async () => {
    const c = makeClient({
      get_data: {
        tier: "professional",
        display_name: "Professional Plus",
        monthly_price_inr: 19999,
        monthly_price_usd: null,
        stripe_price_id: "price_pro_v3",
        max_users: 25,
        max_active_properties: 10,
        max_bookings_per_month: 500,
        max_channel_partners: 50,
        features: ["X"],
      },
    });
    const r = await getPlan("professional", c as never);
    expect(r.display_name).toBe("Professional Plus");
    expect(r.stripe_price_id).toBe("price_pro_v3");
  });

  it("falls back to constant when DB row missing", async () => {
    const c = makeClient({ get_data: null });
    const r = await getPlan("starter", c as never);
    expect(r.tier).toBe("starter");
    expect(r.max_users).toBe(5);
    expect(r.stripe_price_id).toBeNull();
  });

  it("falls back to constant on DB error", async () => {
    const c = makeClient({ get_error: { message: "db" } });
    const r = await getPlan("enterprise", c as never);
    expect(r.tier).toBe("enterprise");
    expect(r.display_name).toBe("Enterprise");
  });
});
