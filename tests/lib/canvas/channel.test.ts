import { describe, expect, it } from "vitest";
import { leadCanvasChannel } from "@/lib/canvas/api";

describe("leadCanvasChannel", () => {
  it("formats channel name as canvas:lead:<id>", () => {
    expect(leadCanvasChannel("abc-123")).toBe("canvas:lead:abc-123");
  });

  it("is idempotent for the same input", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(leadCanvasChannel(id)).toBe(leadCanvasChannel(id));
  });

  it("encodes a different lead_id distinctly", () => {
    expect(leadCanvasChannel("a")).not.toBe(leadCanvasChannel("b"));
  });
});
