// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HotLeadsStrip } from "@/components/command-center/hot-leads";

describe("HotLeadsStrip", () => {
  it("renders the Hot Leads label and dismiss control", () => {
    render(<HotLeadsStrip />);
    expect(screen.getByText("Hot Leads")).toBeInTheDocument();
    expect(screen.getByLabelText("Dismiss hot leads strip")).toBeInTheDocument();
  });

  it("renders all mock hot lead chips with initials and meta", () => {
    render(<HotLeadsStrip />);
    expect(screen.getByText("Rohit Menon")).toBeInTheDocument();
    expect(screen.getByText("Priya Raghavan")).toBeInTheDocument();
    expect(screen.getByText("Karthik Sundaram")).toBeInTheDocument();
    expect(screen.getByText("RM")).toBeInTheDocument();
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.getByText("KS")).toBeInTheDocument();
  });
});
