import { describe, expect, it } from "vitest";
import { stableUuid } from "../../scripts/demo/stable-uuid";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("stableUuid", () => {
  it("returns a v4-shaped UUID", () => {
    const u = stableUuid("hello");
    expect(u).toMatch(UUID_RE);
  });

  it("is deterministic — same seed → same UUID", () => {
    expect(stableUuid("seed-x")).toBe(stableUuid("seed-x"));
  });

  it("differs across seeds", () => {
    expect(stableUuid("seed-a")).not.toBe(stableUuid("seed-b"));
  });

  it("variant nibble is one of 8/9/a/b", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const u = stableUuid(seed);
      const variantChar = u[19];
      expect(["8", "9", "a", "b"]).toContain(variantChar);
    }
  });
});
