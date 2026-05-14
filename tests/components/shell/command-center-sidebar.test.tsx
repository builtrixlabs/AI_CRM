// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { CommandCenterSidebar } from "@/components/shell/command-center-sidebar";

// Permission sets per role — keep in sync with src/lib/auth/rbac.ts so a
// real role change shows up as a test failure here.
const PERMS_SUPER_ADMIN = ["catalog:admin_override", "views:customize"];
const PERMS_ORG_ADMIN = [
  "leads:view",
  "deals:view",
  "contacts:view",
  "catalog:admin_override",
  "views:customize",
];
const PERMS_MANAGER = [
  "leads:view",
  "deals:view",
  "contacts:view",
  "leads:assign",
  "leads:export",
  "calls:listen",
  "audit:view",
  "inventory:block",
];
const PERMS_SALES_REP = [
  "leads:view",
  "deals:view",
  "contacts:view",
  "leads:create",
  "leads:edit",
];
const PERMS_READ_ONLY = ["leads:view", "deals:view", "contacts:view"];
const PERMS_CHANNEL_PARTNER = [
  "cp:submit_lead",
  "cp:view_own_submissions",
];
const PERMS_NONE: string[] = [];

describe("CommandCenterSidebar — always visible", () => {
  it("renders the brand sigil + Command Center + Settings for any caller", () => {
    render(<CommandCenterSidebar baseRole={null} permissions={PERMS_NONE} />);
    expect(screen.getByLabelText("Builtrix home")).toBeInTheDocument();
    expect(screen.getByLabelText("Command Center")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("marks the Command Center link as the current page on /dashboard", () => {
    render(<CommandCenterSidebar baseRole="manager" permissions={PERMS_MANAGER} />);
    expect(screen.getByLabelText("Command Center")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("CommandCenterSidebar — operational items gated by permission", () => {
  it("manager sees leads/deals/contacts (has the read perms)", () => {
    render(
      <CommandCenterSidebar baseRole="manager" permissions={PERMS_MANAGER} />,
    );
    expect(screen.getByLabelText("Leads & Contacts")).toBeInTheDocument();
    expect(screen.getByLabelText("Deals & Calls")).toBeInTheDocument();
    expect(screen.getByLabelText("Communications")).toBeInTheDocument();
  });

  it("sales_rep sees leads/deals/contacts", () => {
    render(
      <CommandCenterSidebar baseRole="sales_rep" permissions={PERMS_SALES_REP} />,
    );
    expect(screen.getByLabelText("Leads & Contacts")).toBeInTheDocument();
    expect(screen.getByLabelText("Deals & Calls")).toBeInTheDocument();
    expect(screen.getByLabelText("Communications")).toBeInTheDocument();
  });

  it("read_only sees leads/deals/contacts", () => {
    render(
      <CommandCenterSidebar baseRole="read_only" permissions={PERMS_READ_ONLY} />,
    );
    expect(screen.getByLabelText("Leads & Contacts")).toBeInTheDocument();
    expect(screen.getByLabelText("Deals & Calls")).toBeInTheDocument();
    expect(screen.getByLabelText("Communications")).toBeInTheDocument();
  });

  it("channel_partner does NOT see leads/deals/contacts (no leads:view etc.)", () => {
    render(
      <CommandCenterSidebar
        baseRole="channel_partner"
        permissions={PERMS_CHANNEL_PARTNER}
      />,
    );
    expect(screen.queryByLabelText("Leads & Contacts")).toBeNull();
    expect(screen.queryByLabelText("Deals & Calls")).toBeNull();
    expect(screen.queryByLabelText("Communications")).toBeNull();
  });

  it("honours org-level deny-override — manager without contacts:view doesn't see Communications", () => {
    const overridden = PERMS_MANAGER.filter((p) => p !== "contacts:view");
    render(<CommandCenterSidebar baseRole="manager" permissions={overridden} />);
    expect(screen.getByLabelText("Leads & Contacts")).toBeInTheDocument();
    expect(screen.getByLabelText("Deals & Calls")).toBeInTheDocument();
    expect(screen.queryByLabelText("Communications")).toBeNull();
  });

  it("user with empty permissions sees only the always-visible items", () => {
    render(<CommandCenterSidebar baseRole={null} permissions={PERMS_NONE} />);
    expect(screen.queryByLabelText("Leads & Contacts")).toBeNull();
    expect(screen.queryByLabelText("Deals & Calls")).toBeNull();
    expect(screen.queryByLabelText("Communications")).toBeNull();
    expect(screen.queryByLabelText("Inventory")).toBeNull();
    expect(screen.queryByLabelText("Pipelines & Views")).toBeNull();
    expect(screen.queryByLabelText("System Health")).toBeNull();
  });
});

describe("CommandCenterSidebar — admin-surface items gated by base_role AND permission", () => {
  it("manager does NOT see Inventory / Pipelines & Views (not in ADMIN_ROLES)", () => {
    render(
      <CommandCenterSidebar baseRole="manager" permissions={PERMS_MANAGER} />,
    );
    expect(screen.queryByLabelText("Inventory")).toBeNull();
    expect(screen.queryByLabelText("Pipelines & Views")).toBeNull();
    expect(screen.queryByLabelText("System Health")).toBeNull();
  });

  it("sales_rep does NOT see Inventory / Pipelines & Views / System Health", () => {
    render(
      <CommandCenterSidebar baseRole="sales_rep" permissions={PERMS_SALES_REP} />,
    );
    expect(screen.queryByLabelText("Inventory")).toBeNull();
    expect(screen.queryByLabelText("Pipelines & Views")).toBeNull();
    expect(screen.queryByLabelText("System Health")).toBeNull();
  });

  it("org_admin sees Inventory / Pipelines & Views / System Health", () => {
    render(
      <CommandCenterSidebar baseRole="org_admin" permissions={PERMS_ORG_ADMIN} />,
    );
    expect(screen.getByLabelText("Inventory")).toBeInTheDocument();
    expect(screen.getByLabelText("Pipelines & Views")).toBeInTheDocument();
    expect(screen.getByLabelText("System Health")).toBeInTheDocument();
  });

  it("org_admin without catalog:admin_override hides Inventory but still sees System Health", () => {
    const denied = PERMS_ORG_ADMIN.filter((p) => p !== "catalog:admin_override");
    render(<CommandCenterSidebar baseRole="org_admin" permissions={denied} />);
    expect(screen.queryByLabelText("Inventory")).toBeNull();
    expect(screen.getByLabelText("System Health")).toBeInTheDocument();
  });

  it("super_admin with limited operational perms still sees admin items (no specific perm gate)", () => {
    render(
      <CommandCenterSidebar
        baseRole="super_admin"
        permissions={PERMS_SUPER_ADMIN}
      />,
    );
    expect(screen.getByLabelText("Inventory")).toBeInTheDocument();
    expect(screen.getByLabelText("Pipelines & Views")).toBeInTheDocument();
    expect(screen.getByLabelText("System Health")).toBeInTheDocument();
  });
});
