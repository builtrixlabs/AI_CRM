import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_DLT_TEMPLATES,
  FOLLOW_UP_DLT_TEMPLATE_IDS,
  FOLLOW_UP_WA_TEMPLATES,
  getDltTemplate,
} from "@/lib/agents/follow-up/dlt";

describe("follow-up template catalog", () => {
  it("FOLLOW_UP_DLT_TEMPLATES exports the default SMS template", () => {
    expect(FOLLOW_UP_DLT_TEMPLATES).toHaveLength(1);
    expect(FOLLOW_UP_DLT_TEMPLATES[0]!.id).toBe("follow_up_default");
  });

  it("FOLLOW_UP_DLT_TEMPLATE_IDS mirrors the DLT template ids", () => {
    expect(FOLLOW_UP_DLT_TEMPLATE_IDS.has("follow_up_default")).toBe(true);
    expect(FOLLOW_UP_DLT_TEMPLATE_IDS.size).toBe(
      FOLLOW_UP_DLT_TEMPLATES.length,
    );
  });

  it("FOLLOW_UP_WA_TEMPLATES exports the default WhatsApp template with a language code", () => {
    expect(FOLLOW_UP_WA_TEMPLATES).toHaveLength(1);
    expect(FOLLOW_UP_WA_TEMPLATES[0]!.id).toBe("follow_up_default");
    expect(FOLLOW_UP_WA_TEMPLATES[0]!.language_code).toBe("en_US");
  });

  it("getDltTemplate resolves a known id and returns null for unknown", () => {
    expect(getDltTemplate("follow_up_default")?.id).toBe("follow_up_default");
    expect(getDltTemplate("nope")).toBeNull();
  });
});
