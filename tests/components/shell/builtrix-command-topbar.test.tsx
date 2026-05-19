// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/leads",
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: async () => undefined },
  }),
}));

vi.mock("@/components/dashboard/new-lead-dialog-context", () => ({
  useNewLeadDialog: () => ({ openDialog: () => undefined }),
  NewLeadDialogProvider: ({ children }: { children: ReactNode }) => children,
}));

import {
  BuiltrixCommandTopbar,
  crumbsFromPathname,
} from "@/components/shell/builtrix-command-topbar";

describe("crumbsFromPathname", () => {
  it("returns BUILTRIX COMMAND on /dashboard", () => {
    expect(crumbsFromPathname("/dashboard")).toEqual({
      eyebrow: "Command / Dashboard",
      title: "BUILTRIX COMMAND",
    });
  });

  it("derives title from the last path segment, eyebrow from all", () => {
    expect(crumbsFromPathname("/dashboard/leads")).toEqual({
      eyebrow: "Command / Leads",
      title: "LEADS",
    });
    expect(crumbsFromPathname("/dashboard/site-visits")).toEqual({
      eyebrow: "Command / Site Visits",
      title: "SITE VISITS",
    });
    expect(crumbsFromPathname("/dashboard/leads/123")).toEqual({
      eyebrow: "Command / Leads / 123",
      title: "123",
    });
  });

  it("handles null/empty pathname", () => {
    expect(crumbsFromPathname(null).title).toBe("BUILTRIX COMMAND");
    expect(crumbsFromPathname("").title).toBe("BUILTRIX COMMAND");
  });
});

describe("BuiltrixCommandTopbar", () => {
  it("renders breadcrumb derived from pathname (mocked to /dashboard/leads)", () => {
    render(
      <BuiltrixCommandTopbar
        tier="manager"
        roleLabel="Manager"
        displayName="Aanya Sharma"
      />,
    );
    expect(screen.getByText("Command / Leads")).toBeTruthy();
    expect(screen.getByText("LEADS")).toBeTruthy();
  });

  it("renders the role chip with tier as a data attribute", () => {
    render(
      <BuiltrixCommandTopbar
        tier="admin"
        roleLabel="Org Admin"
        displayName="Ravi K"
      />,
    );
    const chip = screen.getByLabelText("Signed in as Org Admin");
    expect(chip.getAttribute("data-role-tier")).toBe("admin");
  });

  it("notification badge appears only when count > 0", () => {
    const { rerender } = render(
      <BuiltrixCommandTopbar
        tier="agent"
        roleLabel="Sales Rep"
        displayName="X"
        notificationCount={0}
      />,
    );
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    rerender(
      <BuiltrixCommandTopbar
        tier="agent"
        roleLabel="Sales Rep"
        displayName="X"
        notificationCount={5}
      />,
    );
    expect(screen.getByLabelText("Notifications, 5 unread")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("99+ shown when notification count exceeds 99", () => {
    render(
      <BuiltrixCommandTopbar
        tier="manager"
        roleLabel="Manager"
        displayName="X"
        notificationCount={250}
      />,
    );
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("search trigger dispatches Cmd+K keydown to open the palette", () => {
    render(
      <BuiltrixCommandTopbar
        tier="manager"
        roleLabel="Manager"
        displayName="X"
      />,
    );
    let captured: KeyboardEvent | null = null;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "k" && e.metaKey) captured = e;
    };
    document.addEventListener("keydown", listener);
    fireEvent.click(screen.getByTestId("bcmd-search-trigger"));
    document.removeEventListener("keydown", listener);
    expect(captured).not.toBeNull();
    expect(captured?.key).toBe("k");
    expect(captured?.metaKey).toBe(true);
  });
});
