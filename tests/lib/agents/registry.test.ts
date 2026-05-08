import { describe, expect, it } from "vitest";
import {
  AGENTS,
  findAgent,
  withinCeiling,
} from "@/lib/agents/registry";

describe("AGENTS catalog", () => {
  it("has lead_enrichment with max_tier=T1, prompt_version=v1", () => {
    const lead = AGENTS.find((a) => a.type === "lead_enrichment");
    expect(lead).toBeDefined();
    expect(lead!.max_tier).toBe("T1");
    expect(lead!.prompt_version).toBe("v1");
  });

  it("every entry has unique type", () => {
    const types = AGENTS.map((a) => a.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("findAgent", () => {
  it("returns the spec when known", () => {
    expect(findAgent("lead_enrichment")?.max_tier).toBe("T1");
  });
  it("returns undefined when unknown", () => {
    expect(findAgent("ghost_agent")).toBeUndefined();
  });
});

describe("withinCeiling", () => {
  it("T0 within T1", () => {
    expect(withinCeiling("T0", "T1")).toBe(true);
  });
  it("T1 within T1", () => {
    expect(withinCeiling("T1", "T1")).toBe(true);
  });
  it("T2 NOT within T1", () => {
    expect(withinCeiling("T2", "T1")).toBe(false);
  });
  it("T4 NOT within T0", () => {
    expect(withinCeiling("T4", "T0")).toBe(false);
  });
  it("T2 within T3", () => {
    expect(withinCeiling("T2", "T3")).toBe(true);
  });
});
