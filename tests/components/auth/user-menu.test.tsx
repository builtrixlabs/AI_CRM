// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));

import { UserMenu } from "@/components/auth/user-menu";

describe("UserMenu", () => {
  it("renders the display name", () => {
    render(
      <UserMenu
        displayName="Asha Pillai"
        email="asha@example.com"
        settingsHref="/dashboard/settings"
      />,
    );
    expect(screen.getByTestId("user-menu-name")).toHaveTextContent(
      "Asha Pillai",
    );
  });

  it("falls back to the email when displayName is missing", () => {
    render(
      <UserMenu
        displayName={null}
        email="asha@example.com"
        settingsHref="/dashboard/settings"
      />,
    );
    expect(screen.getByTestId("user-menu-name")).toHaveTextContent(
      "asha@example.com",
    );
  });

  it("renders a Settings link to the provided href", () => {
    render(
      <UserMenu
        displayName="Asha"
        email="asha@example.com"
        settingsHref="/cp/settings"
      />,
    );
    const link = screen.getByTestId("user-menu-settings") as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/cp/settings");
    expect(link.textContent).toMatch(/settings/i);
  });

  it("renders a Sign out button", () => {
    render(
      <UserMenu
        displayName="Asha"
        email="asha@example.com"
        settingsHref="/dashboard/settings"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("uses the email as a tooltip on the name span", () => {
    render(
      <UserMenu
        displayName="Asha"
        email="asha@example.com"
        settingsHref="/dashboard/settings"
      />,
    );
    expect(screen.getByTestId("user-menu-name").getAttribute("title")).toBe(
      "asha@example.com",
    );
  });
});
