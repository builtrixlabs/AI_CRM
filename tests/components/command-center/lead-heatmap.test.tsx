// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeadHeatmap } from "@/components/command-center/lead-heatmap";

describe("<LeadHeatmap> — D-605 per-day volume chart", () => {
  it("renders one bar per day plus the month total", () => {
    render(
      <LeadHeatmap
        volume={[
          { date: "2026-05-13", count: 3, avg_intent: 50 },
          { date: "2026-05-14", count: 7, avg_intent: 80 },
        ]}
      />,
    );
    expect(screen.getAllByTestId("cc-heatmap-bar")).toHaveLength(2);
    expect(screen.getByText("10 total")).toBeInTheDocument();
  });

  it("renders the empty state when there is no volume", () => {
    render(<LeadHeatmap volume={[]} />);
    expect(screen.getByTestId("cc-heatmap-empty")).toBeInTheDocument();
  });
});
