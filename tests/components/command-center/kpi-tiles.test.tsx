// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiTiles } from "@/components/command-center/kpi-tiles";

describe("<KpiTiles> — D-605 real data", () => {
  it("renders the four real KPI values + labels", () => {
    render(
      <KpiTiles
        kpis={{
          active_leads: 12,
          hot_pipeline: 4,
          avg_intent: 67,
          closed_mtd: 3,
        }}
      />,
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("67")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Active leads")).toBeInTheDocument();
    expect(screen.getByText("Closed · MTD")).toBeInTheDocument();
  });

  it("renders zeros cleanly (fresh org)", () => {
    render(
      <KpiTiles
        kpis={{ active_leads: 0, hot_pipeline: 0, avg_intent: 0, closed_mtd: 0 }}
      />,
    );
    expect(screen.getAllByText("0")).toHaveLength(4);
  });
});
