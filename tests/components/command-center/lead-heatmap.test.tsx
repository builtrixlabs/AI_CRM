// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeadHeatmap } from "@/components/command-center/lead-heatmap";

describe("LeadHeatmap", () => {
  it("renders the section header", () => {
    render(<LeadHeatmap />);
    expect(screen.getByText(/Leads clustered by intent, not pin/i)).toBeInTheDocument();
  });

  it("renders all five clusters with their labels", () => {
    render(<LeadHeatmap />);
    expect(screen.getByText(/Sholinganallur/)).toBeInTheDocument();
    expect(screen.getByText(/Velachery/)).toBeInTheDocument();
    expect(screen.getByText(/OMR/)).toBeInTheDocument();
    expect(screen.getByText(/Nanganallur/)).toBeInTheDocument();
    expect(screen.getByText(/ECR/)).toBeInTheDocument();
  });

  it("renders the legend", () => {
    render(<LeadHeatmap />);
    expect(screen.getByText("high intent")).toBeInTheDocument();
    expect(screen.getByText("exploring")).toBeInTheDocument();
    expect(screen.getByText("cooling")).toBeInTheDocument();
  });
});
