// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteVisitListTable } from "@/components/sitevisits/site-visit-list-table";
import type { SiteVisitListRow } from "@/lib/sitevisits/list";

function row(
  over: Partial<SiteVisitListRow> & { id: string },
): SiteVisitListRow {
  return {
    id: over.id,
    state: over.state ?? "scheduled",
    scheduled_at: over.scheduled_at ?? "2026-05-20T06:00:00Z",
    lead_id: over.lead_id ?? "lead-1",
    lead_label: over.lead_label ?? "Asha Rao",
    project_id: over.project_id ?? null,
    coordinator_id: over.coordinator_id ?? null,
    assigned_sales_rep_id: over.assigned_sales_rep_id ?? null,
    created_by: over.created_by ?? "user-1",
    created_at: over.created_at ?? "2026-05-14T00:00:00Z",
  };
}

describe("<SiteVisitListTable>", () => {
  it("renders the empty state when there are no rows", () => {
    render(<SiteVisitListTable rows={[]} />);
    expect(screen.getByTestId("sv-list-empty")).toBeInTheDocument();
  });

  it("renders a row per visit with the lead label and a detail link", () => {
    render(
      <SiteVisitListTable
        rows={[
          row({ id: "v1", lead_label: "Asha Rao" }),
          row({ id: "v2", lead_label: "Biju K" }),
        ]}
      />,
    );
    expect(screen.getByTestId("sv-row-v1")).toBeInTheDocument();
    expect(screen.getByTestId("sv-row-v2")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Asha Rao" });
    expect(link).toHaveAttribute("href", "/dashboard/site-visits/v1");
  });

  it("renders the status as a badge", () => {
    render(<SiteVisitListTable rows={[row({ id: "v1", state: "no_show" })]} />);
    expect(screen.getByText("no show")).toBeInTheDocument();
  });

  it("shows 'Unassigned' when no sales rep is set", () => {
    render(
      <SiteVisitListTable
        rows={[row({ id: "v1", assigned_sales_rep_id: null })]}
      />,
    );
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });
});
