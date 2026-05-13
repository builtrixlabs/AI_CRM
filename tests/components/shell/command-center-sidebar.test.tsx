// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { CommandCenterSidebar } from "@/components/shell/command-center-sidebar";

describe("CommandCenterSidebar — always-visible items", () => {
  it("renders the brand sigil and always-visible nav links for any role", () => {
    render(<CommandCenterSidebar baseRole={null} />);
    expect(screen.getByLabelText("Builtrix home")).toBeInTheDocument();
    expect(screen.getByLabelText("Command Center")).toBeInTheDocument();
    expect(screen.getByLabelText("Leads & Contacts")).toBeInTheDocument();
    expect(screen.getByLabelText("Deals & Calls")).toBeInTheDocument();
    expect(screen.getByLabelText("Communications")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("marks the Command Center link as the current page on /dashboard", () => {
    render(<CommandCenterSidebar baseRole={null} />);
    const home = screen.getByLabelText("Command Center");
    expect(home).toHaveAttribute("aria-current", "page");
  });
});

describe("CommandCenterSidebar — admin-only items", () => {
  it("hides admin-only icons when baseRole is null", () => {
    render(<CommandCenterSidebar baseRole={null} />);
    expect(screen.queryByLabelText("Inventory")).toBeNull();
    expect(screen.queryByLabelText("Pipelines & Views")).toBeNull();
    expect(screen.queryByLabelText("System Health")).toBeNull();
  });

  it("hides admin-only icons for an org member (non-admin role)", () => {
    render(<CommandCenterSidebar baseRole="member" />);
    expect(screen.queryByLabelText("Inventory")).toBeNull();
    expect(screen.queryByLabelText("Pipelines & Views")).toBeNull();
    expect(screen.queryByLabelText("System Health")).toBeNull();
  });

  it("hides admin-only icons for a channel partner", () => {
    render(<CommandCenterSidebar baseRole="channel_partner" />);
    expect(screen.queryByLabelText("Inventory")).toBeNull();
    expect(screen.queryByLabelText("Pipelines & Views")).toBeNull();
    expect(screen.queryByLabelText("System Health")).toBeNull();
  });

  it("shows admin-only icons for org_admin", () => {
    render(<CommandCenterSidebar baseRole="org_admin" />);
    expect(screen.getByLabelText("Inventory")).toBeInTheDocument();
    expect(screen.getByLabelText("Pipelines & Views")).toBeInTheDocument();
    expect(screen.getByLabelText("System Health")).toBeInTheDocument();
  });

  it("shows admin-only icons for org_owner", () => {
    render(<CommandCenterSidebar baseRole="org_owner" />);
    expect(screen.getByLabelText("Inventory")).toBeInTheDocument();
    expect(screen.getByLabelText("Pipelines & Views")).toBeInTheDocument();
    expect(screen.getByLabelText("System Health")).toBeInTheDocument();
  });

  it("shows admin-only icons for super_admin", () => {
    render(<CommandCenterSidebar baseRole="super_admin" />);
    expect(screen.getByLabelText("Inventory")).toBeInTheDocument();
    expect(screen.getByLabelText("Pipelines & Views")).toBeInTheDocument();
    expect(screen.getByLabelText("System Health")).toBeInTheDocument();
  });
});
