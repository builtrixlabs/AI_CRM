// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => {
    mocks.createClient();
    return { auth: { signOut: mocks.signOut } };
  },
}));

import { SignOutButton } from "@/components/auth/sign-out-button";

let originalLocation: Location;

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.createClient.mockReset();
  originalLocation = window.location;
  // jsdom forbids assigning window.location.href; replace the descriptor.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "" } as Location,
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe("SignOutButton", () => {
  it("renders the default label and aria-label", () => {
    render(<SignOutButton />);
    const btn = screen.getByRole("button", { name: "Sign out" });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("calls supabase.auth.signOut and redirects to /auth/sign-in by default", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(window.location.href).toBe("/auth/sign-in"),
    );
  });

  it("honours a custom redirectTo", async () => {
    render(<SignOutButton redirectTo="/auth/sign-in?reason=manual" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(window.location.href).toBe("/auth/sign-in?reason=manual"),
    );
  });

  it("still redirects when supabase.signOut throws (best-effort)", async () => {
    mocks.signOut.mockRejectedValue(new Error("network down"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(window.location.href).toBe("/auth/sign-in"),
    );
  });

  it("renders a custom label when provided", () => {
    render(<SignOutButton label="Log out" />);
    expect(
      screen.getByRole("button", { name: "Sign out" }).textContent,
    ).toBe("Log out");
  });
});
