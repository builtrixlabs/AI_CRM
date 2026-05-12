// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiTiles } from "@/components/command-center/kpi-tiles";

describe("KpiTiles", () => {
  it("renders four KPI tiles with their labels", () => {
    render(<KpiTiles />);
    expect(screen.getByText("Active leads")).toBeInTheDocument();
    expect(screen.getByText("Hot pipeline")).toBeInTheDocument();
    expect(screen.getByText("Avg intent")).toBeInTheDocument();
    expect(screen.getByText("Closed · MTD")).toBeInTheDocument();
  });

  it("renders the headline values", () => {
    render(<KpiTiles />);
    expect(screen.getByText("247")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("/100")).toBeInTheDocument();
  });

  it("renders the delta pills", () => {
    render(<KpiTiles />);
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });
});
