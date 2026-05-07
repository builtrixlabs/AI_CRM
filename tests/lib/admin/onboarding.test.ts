import { describe, expect, it, vi } from "vitest";
import {
  advanceStep,
  getOnboardingState,
  HARD_GATED_STEPS,
  OnboardingHardGateError,
  OnboardingPayloadError,
  onboardingStateSchema,
  STEP_IDS,
  stepPayloadSchemas,
} from "@/lib/admin";

const ORG_ID = "11111111-2222-4333-8444-555555555555";
const ACTOR = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("STEP_IDS shape", () => {
  it("has exactly 8 step ids in the documented order", () => {
    expect(STEP_IDS.length).toBe(8);
    expect(STEP_IDS[0]).toBe("org_details");
    expect(STEP_IDS[2]).toBe("first_workspace");
    expect(STEP_IDS[7]).toBe("sample_demo");
  });

  it("HARD_GATED_STEPS has exactly org_details + first_workspace", () => {
    expect(HARD_GATED_STEPS.size).toBe(2);
    expect(HARD_GATED_STEPS.has("org_details")).toBe(true);
    expect(HARD_GATED_STEPS.has("first_workspace")).toBe(true);
    expect(HARD_GATED_STEPS.has("branding")).toBe(false);
  });
});

describe("onboardingStateSchema", () => {
  it("populates defaults for an empty payload", () => {
    const r = onboardingStateSchema.parse({});
    expect(r.completed).toBe(false);
    expect(r.current_step).toBe("org_details");
    expect(r.completed_steps).toEqual([]);
    expect(r.pipeline_stages.length).toBeGreaterThan(0);
    expect(r.integrations.email).toBeNull();
  });

  it("accepts a full state object", () => {
    const r = onboardingStateSchema.parse({
      completed: true,
      current_step: "completed",
      completed_steps: ["org_details", "branding"],
      lead_sources: ["walkin"],
      pipeline_stages: ["new"],
      integrations: { email: "smtp", whatsapp: null, telephony: null },
    });
    expect(r.completed).toBe(true);
    expect(r.current_step).toBe("completed");
  });

  it("dedupes completed_steps", () => {
    const r = onboardingStateSchema.parse({
      completed_steps: ["org_details", "org_details", "branding"],
    });
    expect(r.completed_steps).toEqual(["org_details", "branding"]);
  });
});

describe("stepPayloadSchemas — accept + reject samples", () => {
  it("org_details rejects bad email", () => {
    const ok = stepPayloadSchemas.org_details.safeParse({
      primary_contact_email: "anita@example.com",
      primary_contact_name: "Anita",
    });
    expect(ok.success).toBe(true);
    const bad = stepPayloadSchemas.org_details.safeParse({
      primary_contact_email: "not-an-email",
      primary_contact_name: "Anita",
    });
    expect(bad.success).toBe(false);
  });

  it("first_workspace rejects bad slug", () => {
    expect(
      stepPayloadSchemas.first_workspace.safeParse({
        slug: "Has Spaces",
        name: "Mumbai Sales",
      }).success
    ).toBe(false);
  });

  it("branding rejects bad color hex", () => {
    expect(
      stepPayloadSchemas.branding.safeParse({ primary_color: "blue" }).success
    ).toBe(false);
    expect(
      stepPayloadSchemas.branding.safeParse({ primary_color: "#1a1a1a" }).success
    ).toBe(true);
  });

  it("team_users caps invites at 3", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      email: `u${i}@example.com`,
      display_name: `User ${i}`,
      app_role: "sales_rep" as const,
    }));
    expect(stepPayloadSchemas.team_users.safeParse({ invites: four }).success).toBe(false);
    expect(
      stepPayloadSchemas.team_users.safeParse({ invites: four.slice(0, 3) }).success
    ).toBe(true);
  });

  it("integrations accepts null + enum values", () => {
    expect(
      stepPayloadSchemas.integrations.safeParse({
        email: "smtp",
        whatsapp: null,
        telephony: null,
      }).success
    ).toBe(true);
  });
});

const makeClient = (initial: unknown = {}) => {
  const audit: Array<Record<string, unknown>> = [];
  const orgRow = { onboarding_state: initial };
  const workspaceQ = vi.fn().mockResolvedValue({
    data: { id: "ws-1" },
    error: null,
  });
  return {
    audit,
    orgRow,
    client: {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: "u-new" } },
            error: null,
          }),
        },
      },
      from: vi.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: orgRow,
              error: null,
            }),
            update: vi.fn((patch: Record<string, unknown>) => {
              if (patch.onboarding_state) {
                orgRow.onboarding_state = patch.onboarding_state;
              }
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: workspaceQ,
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "audit_log") {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              audit.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        throw new Error(`Unexpected from('${table}')`);
      }),
    },
  };
};

describe("getOnboardingState", () => {
  it("returns parsed defaults for an org with empty onboarding_state", async () => {
    const { client } = makeClient({});
    const state = await getOnboardingState(ORG_ID, client as unknown as never);
    expect(state.current_step).toBe("org_details");
    expect(state.completed).toBe(false);
  });
});

describe("advanceStep — happy path per step", () => {
  it("step 1 (org_details) advances to step 2 + writes audit", async () => {
    const { client, audit } = makeClient({});
    const result = await advanceStep(
      {
        org_id: ORG_ID,
        actor: ACTOR,
        step: "org_details",
        payload: {
          primary_contact_email: "anita@example.com",
          primary_contact_name: "Anita",
        },
      },
      client as unknown as never
    );
    expect(result.next_step).toBe("branding");
    expect(result.completed).toBe(false);
    expect(audit.length).toBe(1);
    expect(audit[0].action).toBe("onboarding_step_completed");
  });

  it("step 4 (lead_sources) records selection in onboarding_state", async () => {
    const initial = {
      completed: false,
      current_step: "lead_sources",
      completed_steps: ["org_details", "branding", "first_workspace"],
      lead_sources: [],
      pipeline_stages: [],
      integrations: { email: null, whatsapp: null, telephony: null },
    };
    const { client, orgRow } = makeClient(initial);
    await advanceStep(
      {
        org_id: ORG_ID,
        actor: ACTOR,
        step: "lead_sources",
        payload: { sources: ["walkin", "channel_partner"] },
      },
      client as unknown as never
    );
    const next = orgRow.onboarding_state as { lead_sources: string[]; current_step: string };
    expect(next.lead_sources).toEqual(["walkin", "channel_partner"]);
    expect(next.current_step).toBe("pipeline_stages");
  });
});

describe("advanceStep — hard-gate skip rejected", () => {
  it("skipping org_details throws OnboardingHardGateError", async () => {
    const { client } = makeClient({});
    await expect(
      advanceStep(
        {
          org_id: ORG_ID,
          actor: ACTOR,
          step: "org_details",
          payload: {},
          skipped: true,
        },
        client as unknown as never
      )
    ).rejects.toBeInstanceOf(OnboardingHardGateError);
  });

  it("skipping first_workspace throws OnboardingHardGateError", async () => {
    const { client } = makeClient({});
    await expect(
      advanceStep(
        {
          org_id: ORG_ID,
          actor: ACTOR,
          step: "first_workspace",
          payload: {},
          skipped: true,
        },
        client as unknown as never
      )
    ).rejects.toBeInstanceOf(OnboardingHardGateError);
  });

  it("skipping branding (a soft step) is allowed", async () => {
    const { client, audit } = makeClient({
      current_step: "branding",
      completed_steps: ["org_details"],
    });
    const result = await advanceStep(
      {
        org_id: ORG_ID,
        actor: ACTOR,
        step: "branding",
        payload: {},
        skipped: true,
      },
      client as unknown as never
    );
    expect(result.next_step).toBe("first_workspace");
    expect(audit[0].action).toBe("onboarding_step_skipped");
  });
});

describe("advanceStep — invalid payload throws OnboardingPayloadError", () => {
  it("step 1 with missing email is rejected with Zod issues attached", async () => {
    const { client } = makeClient({});
    try {
      await advanceStep(
        {
          org_id: ORG_ID,
          actor: ACTOR,
          step: "org_details",
          payload: { primary_contact_name: "Anita" },
        },
        client as unknown as never
      );
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OnboardingPayloadError);
      expect((err as OnboardingPayloadError).step).toBe("org_details");
      expect((err as OnboardingPayloadError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe("advanceStep — completion sets completed=true", () => {
  it("step 8 (sample_demo) flips completed to true and current_step to 'completed'", async () => {
    const initial = {
      completed: false,
      current_step: "sample_demo",
      completed_steps: STEP_IDS.slice(0, 7),
      lead_sources: [],
      pipeline_stages: [],
      integrations: { email: null, whatsapp: null, telephony: null },
    };
    const { client, orgRow } = makeClient(initial);
    const result = await advanceStep(
      {
        org_id: ORG_ID,
        actor: ACTOR,
        step: "sample_demo",
        payload: { walked_through: true },
      },
      client as unknown as never
    );
    expect(result.next_step).toBe("completed");
    expect(result.completed).toBe(true);
    const after = orgRow.onboarding_state as { completed: boolean; current_step: string };
    expect(after.completed).toBe(true);
    expect(after.current_step).toBe("completed");
  });
});
