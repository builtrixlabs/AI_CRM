// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: mocks.signOut },
  }),
}));

import { CommandCenterTopbar } from "@/components/shell/command-center-topbar";

const originalLocation = window.location;

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.signOut.mockResolvedValue({ error: null });
  // jsdom's location is non-configurable; stub the href setter via a
  // writable property so the sign-out hard-nav can be asserted.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "" } as Location,
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("CommandCenterTopbar", () => {
  it("renders the live indicator and operator status", () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/12 agents online/i)).toBeInTheDocument();
  });

  it("renders the workspace switcher", () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    expect(screen.getByText("Casagrand · Chennai South")).toBeInTheDocument();
  });

  it("renders user initials in the avatar chip", () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    expect(screen.getByLabelText("Profile and settings")).toHaveTextContent("AR");
  });

  it("falls back to placeholder initials when displayName is null", () => {
    render(<CommandCenterTopbar displayName={null} />);
    expect(screen.getByLabelText("Profile and settings")).toHaveTextContent("··");
  });

  it("renders the sign-out icon button (regression — D-500 had dropped it)", () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    expect(screen.getByTestId("topbar-sign-out")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-sign-out")).toHaveAttribute(
      "aria-label",
      "Sign out",
    );
  });

  it("calls supabase.auth.signOut() and hard-navigates on click", async () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    fireEvent.click(screen.getByTestId("topbar-sign-out"));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(window.location.href).toBe("/auth/sign-in"),
    );
  });

  it("still hard-navigates to sign-in even when signOut() rejects", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("network down"));
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    fireEvent.click(screen.getByTestId("topbar-sign-out"));
    await waitFor(() =>
      expect(window.location.href).toBe("/auth/sign-in"),
    );
  });
});
