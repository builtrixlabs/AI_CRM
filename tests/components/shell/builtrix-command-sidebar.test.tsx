// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { BuiltrixCommandSidebar } from "@/components/shell/builtrix-command-sidebar";

const AGENT_PERMS = [
  "leads:view",
  "deals:view",
  "contacts:view",
  "site_visits:view",
];
const MANAGER_PERMS = [
  ...AGENT_PERMS,
  "views:customize",
  "leads:assign",
  "calls:listen",
];
const ADMIN_PERMS = [...MANAGER_PERMS];

describe("BuiltrixCommandSidebar — role-aware nav", () => {
  it("agent tier sees focused queue nav, no admin surfaces", () => {
    render(
      <BuiltrixCommandSidebar
        tier="agent"
        roleLabel="Sales Rep"
        displayName="Priya Iyer"
        permissions={AGENT_PERMS}
      />,
    );
    // Agent-specific labels
    expect(screen.getByText("My Day")).toBeTruthy();
    expect(screen.getByText("My Queue")).toBeTruthy();
    // Admin surfaces hidden even if perm somehow leaked
    expect(screen.queryByText("Pipelines & Views")).toBeNull();
    expect(screen.queryByText("System Health")).toBeNull();
    // Role + name in user card
    expect(screen.getByText("Priya Iyer")).toBeTruthy();
    expect(screen.getByText("Sales Rep")).toBeTruthy();
  });

  it("manager tier sees rollup nav but no admin-surface items (route-policy contract)", () => {
    render(
      <BuiltrixCommandSidebar
        tier="manager"
        roleLabel="Manager"
        displayName="Aanya Sharma"
        permissions={MANAGER_PERMS}
      />,
    );
    expect(screen.getByText("Command Center")).toBeTruthy();
    expect(screen.getByText("Leads & Contacts")).toBeTruthy();
    expect(screen.getByText("Deals & Calls")).toBeTruthy();
    // Admin surfaces hidden even when the manager holds the precise perm —
    // route-policy.ts redirects non-admin base_roles off /admin/* anyway.
    expect(screen.queryByText("Pipelines & Views")).toBeNull();
    expect(screen.queryByText("System Health")).toBeNull();
    expect(screen.queryByText("Team")).toBeNull();
  });

  it("admin tier sees Operate section + System Health", () => {
    render(
      <BuiltrixCommandSidebar
        tier="admin"
        roleLabel="Org Admin"
        displayName="Ravi Krishnan"
        permissions={ADMIN_PERMS}
      />,
    );
    expect(screen.getByText("Operate")).toBeTruthy();
    expect(screen.getByText("System Health")).toBeTruthy();
    expect(screen.getByText("Pipelines & Views")).toBeTruthy();
  });

  it("permission-gated items are hidden when permission is missing", () => {
    render(
      <BuiltrixCommandSidebar
        tier="manager"
        roleLabel="Manager"
        displayName="Aanya Sharma"
        permissions={["leads:view"]}
      />,
    );
    // Has leads:view → shows Leads
    expect(screen.getByText("Leads & Contacts")).toBeTruthy();
    // Lacks deals:view → hides Deals & Calls
    expect(screen.queryByText("Deals & Calls")).toBeNull();
    // Lacks views:customize → hides Pipelines & Views
    expect(screen.queryByText("Pipelines & Views")).toBeNull();
  });

  it("always renders Settings in the footer", () => {
    render(
      <BuiltrixCommandSidebar
        tier="agent"
        roleLabel="Sales Rep"
        displayName="Test User"
        permissions={[]}
      />,
    );
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("falls back to ·· when display name is null", () => {
    render(
      <BuiltrixCommandSidebar
        tier="agent"
        roleLabel="Sales Rep"
        displayName={null}
        permissions={[]}
      />,
    );
    expect(screen.getByText("··")).toBeTruthy();
    expect(screen.getByText("Builtrix Member")).toBeTruthy();
  });
});
