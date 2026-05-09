import { describe, expect, it, vi } from "vitest";
import { getCockpitData } from "@/lib/admin";

const ORG_ID = "11111111-2222-4333-8444-555555555555";

const headCount = (count: number) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  // Final await yields {data, error, count}
  then: (resolve: (v: unknown) => void) =>
    resolve({ data: [], error: null, count }),
});

describe("getCockpitData", () => {
  it("returns the assembled shape with live counts", async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === "subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { plan_tier: "professional", status: "active" },
              error: null,
            }),
          };
        }
        if (table === "profiles") return headCount(7);
        if (table === "workspaces") return headCount(2);
        if (table === "nodes") return headCount(45);
        if (table === "support_tickets") return headCount(1);
        if (table === "organizations") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { rera_number: "PRM/KA/RERA/1251/308/PR/200405/001234", gstin: "29AAACC1234A1Z5" },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: {
                onboarding_state: {
                  completed: false,
                  current_step: "lead_sources",
                  completed_steps: ["org_details", "branding", "first_workspace"],
                  lead_sources: [],
                  pipeline_stages: [],
                  integrations: { email: null, whatsapp: null, telephony: null },
                },
              },
              error: null,
            }),
          };
        }
        throw new Error(`Unexpected from('${table}')`);
      }),
    };

    const result = await getCockpitData(ORG_ID, client as unknown as never);
    expect(result.subscription).toEqual({ plan_tier: "professional", status: "active" });
    expect(result.usage).toEqual({
      active_users: 7,
      workspaces: 2,
      leads_30d: 45,
    });
    expect(result.open_tickets).toBe(1);
    expect(result.onboarding.completed).toBe(false);
    expect(result.onboarding.current_step).toBe("lead_sources");
    expect(result.compliance).toEqual({
      rera_number: "PRM/KA/RERA/1251/308/PR/200405/001234",
      gstin: "29AAACC1234A1Z5",
    });
  });

  it("returns null subscription + 0 counts when nothing is seeded", async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === "subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (
          table === "profiles" ||
          table === "workspaces" ||
          table === "nodes" ||
          table === "support_tickets"
        )
          return headCount(0);
        if (table === "organizations") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { rera_number: null, gstin: null },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: { onboarding_state: {} },
              error: null,
            }),
          };
        }
        throw new Error(`Unexpected from('${table}')`);
      }),
    };
    const result = await getCockpitData(ORG_ID, client as unknown as never);
    expect(result.subscription).toBeNull();
    expect(result.usage.active_users).toBe(0);
    expect(result.onboarding.current_step).toBe("org_details");
    expect(result.compliance).toEqual({ rera_number: null, gstin: null });
  });
});
