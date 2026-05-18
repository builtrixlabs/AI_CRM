// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HotLeadsStrip } from "@/components/command-center/hot-leads";

describe("<HotLeadsStrip> — D-605 real top-5 by intent", () => {
  it("renders a chip per hot lead linking to the lead canvas", () => {
    render(
      <HotLeadsStrip
        hotLeads={[
          {
            id: "lead-1",
            label: "Asha Rao",
            intent_score: 92,
            phone: "+919876543210",
          },
          { id: "lead-2", label: "Biju K", intent_score: 81, phone: null },
        ]}
      />,
    );
    expect(screen.getAllByTestId("cc-hot-chip")).toHaveLength(2);
    const link = screen.getByRole("link", { name: /Asha Rao/ });
    expect(link).toHaveAttribute("href", "/dashboard/leads/lead-1");
    expect(screen.getByText("92")).toBeInTheDocument();
    expect(screen.getByText("Hot Leads")).toBeInTheDocument();
  });

  it("renders the empty state with no hot leads", () => {
    render(<HotLeadsStrip hotLeads={[]} />);
    expect(screen.getByTestId("cc-hot-empty")).toBeInTheDocument();
  });
});
