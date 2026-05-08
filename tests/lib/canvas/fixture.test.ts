import { describe, expect, it } from "vitest";
import { DEMO_LEAD, DEMO_ACTIVITIES } from "@/lib/canvas/fixture";
import { leadSchema } from "@/lib/nodes/schemas/lead";

describe("DEMO_LEAD", () => {
  it("has Priya Sharma as the label", () => {
    expect(DEMO_LEAD.label).toBe("Priya Sharma");
  });

  it("has data that parses through leadSchema", () => {
    const parsed = leadSchema.safeParse(DEMO_LEAD.data);
    expect(parsed.success).toBe(true);
  });

  it("uses an ALLOWED state value for lead", () => {
    expect(["new", "contacted", "qualified", "lost", "on_hold", "junk"]).toContain(DEMO_LEAD.state);
  });
});

describe("DEMO_ACTIVITIES", () => {
  it("contains at least one AI-author row to exercise the tier badge", () => {
    expect(DEMO_ACTIVITIES.some((a) => a.agent_tier !== null)).toBe(true);
  });

  it("contains at least one human-author row to test the no-badge path", () => {
    expect(DEMO_ACTIVITIES.some((a) => a.agent_tier === null)).toBe(true);
  });

  it("has unique IDs across activities", () => {
    const ids = DEMO_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tags every row with the same org+workspace as the lead", () => {
    for (const activity of DEMO_ACTIVITIES) {
      expect(activity.organization_id).toBe(DEMO_LEAD.organization_id);
      expect(activity.workspace_id).toBe(DEMO_LEAD.workspace_id);
    }
  });
});
