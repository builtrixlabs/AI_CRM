// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TierBadge } from "@/components/canvas/tier-badge";

describe("TierBadge", () => {
  it.each([
    ["T0", "neutral"],
    ["T1", "blue"],
    ["T2", "emerald"],
    ["T3", "amber"],
    ["T4", "rose"],
  ] as const)("renders %s with %s color", (tier, color) => {
    render(<TierBadge tier={tier} />);
    const badge = screen.getByTestId("tier-badge");
    expect(badge.getAttribute("data-tier")).toBe(tier);
    expect(badge.className).toContain(color);
    expect(badge.textContent).toBe(tier);
  });

  it("renders nothing when tier is null", () => {
    const { container } = render(<TierBadge tier={null} />);
    expect(container.firstChild).toBeNull();
  });
});
