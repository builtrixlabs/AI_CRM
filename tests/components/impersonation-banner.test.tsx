// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

import { ImpersonationBanner } from "@/components/platform/impersonation-banner";

describe("<ImpersonationBanner>", () => {
  it("renders nothing when no impersonation context", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      user: { id: "u", email: "" },
      profile: { id: "u", display_name: "x", base_role: "super_admin" },
      org_id: null,
      workspace_ids: [],
      app_roles: [],
      impersonation: null,
    });
    const ui = await ImpersonationBanner();
    expect(ui).toBeNull();
  });

  it("renders banner with org name + Exit form when impersonation is active", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      user: { id: "u", email: "" },
      profile: { id: "u", display_name: "x", base_role: "org_admin" },
      org_id: "org-1",
      workspace_ids: [],
      app_roles: [],
      impersonation: {
        impersonator_id: "u",
        organization_id: "org-1",
        organization_name: "Acme Builders",
        started_at: "2026-05-19T12:00:00.000Z",
        expires_at: "2026-05-19T12:30:00.000Z",
      },
    });
    const ui = await ImpersonationBanner();
    render(ui as React.ReactElement);
    expect(screen.getByTestId("impersonation-banner")).toBeTruthy();
    expect(screen.getByTestId("impersonation-target").textContent).toBe(
      "Acme Builders",
    );
    expect(screen.getByTestId("impersonation-exit")).toBeTruthy();
  });

  it("falls back to organization_id when no name is resolved", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      user: { id: "u", email: "" },
      profile: { id: "u", display_name: "x", base_role: "org_admin" },
      org_id: "org-9",
      workspace_ids: [],
      app_roles: [],
      impersonation: {
        impersonator_id: "u",
        organization_id: "org-9",
        organization_name: null,
        started_at: "2026-05-19T12:00:00.000Z",
        expires_at: "2026-05-19T12:30:00.000Z",
      },
    });
    const ui = await ImpersonationBanner();
    render(ui as React.ReactElement);
    expect(screen.getByTestId("impersonation-target").textContent).toBe("org-9");
  });
});
