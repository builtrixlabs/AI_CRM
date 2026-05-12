// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { CommandCenterSidebar } from "@/components/shell/command-center-sidebar";

describe("CommandCenterSidebar", () => {
  it("renders the brand sigil and primary nav links", () => {
    render(<CommandCenterSidebar />);
    expect(screen.getByLabelText("Builtrix home")).toBeInTheDocument();
    expect(screen.getByLabelText("Command Center")).toBeInTheDocument();
    expect(screen.getByLabelText("Leads & Contacts")).toBeInTheDocument();
    expect(screen.getByLabelText("Inventory")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("marks the Command Center link as the current page on /dashboard", () => {
    render(<CommandCenterSidebar />);
    const home = screen.getByLabelText("Command Center");
    expect(home).toHaveAttribute("aria-current", "page");
  });
});
