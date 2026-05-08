// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchLeads: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  createLeadAction: vi.fn(),
  updateLeadAction: vi.fn(),
  transitionLeadAction: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: mocks.signOut },
  }),
}));

import { CommandPalette } from "@/components/cmdk/command-palette";
import { NewLeadDialogProvider } from "@/components/dashboard/new-lead-dialog-context";

const ALL_PERMS = [
  "leads:view",
  "leads:create",
  "leads:edit",
  "deals:view",
  "contacts:view",
  "site_visits:view",
  "organizations:edit",
  "settings:manage_users",
  "settings:manage_integrations",
  "subscriptions:view",
  "billing:view",
  "audit:view",
  "platform:manage",
  "platform_analytics:view",
];

function renderPalette(perms = ALL_PERMS) {
  return render(
    <NewLeadDialogProvider>
      <CommandPalette
        visiblePerms={perms}
        searchLeadsImpl={mocks.searchLeads as never}
      />
    </NewLeadDialogProvider>,
  );
}

function dispatchHotkey() {
  const ev = new KeyboardEvent("keydown", {
    key: "k",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(ev);
}

beforeEach(() => {
  for (const k of Object.keys(mocks) as (keyof typeof mocks)[]) {
    const m = mocks[k];
    if (m && typeof (m as { mockReset?: unknown }).mockReset === "function") {
      (m as { mockReset: () => void }).mockReset();
    }
  }
  mocks.signOut.mockResolvedValue(undefined);
});

describe("CommandPalette", () => {
  it("is closed by default", () => {
    renderPalette();
    expect(screen.queryByTestId("command-palette")).toBeNull();
  });

  it("opens when Cmd+K fires the global hotkey", () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    expect(screen.getByTestId("command-palette")).toHaveAttribute(
      "data-mode",
      "catalog",
    );
  });

  it("renders permission-gated commands only (sales_rep)", () => {
    renderPalette([
      "leads:view",
      "leads:create",
      "deals:view",
      "contacts:view",
      "site_visits:view",
    ]);
    act(() => {
      dispatchHotkey();
    });
    expect(screen.getByTestId("command-lead-create")).toBeInTheDocument();
    expect(screen.queryByTestId("command-nav-platform")).toBeNull();
    expect(screen.queryByTestId("command-nav-admin")).toBeNull();
  });

  it("activating a navigate command pushes the target and closes", () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-nav-dashboard"));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("activating Create new lead opens the New Lead dialog and closes the palette", () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-create"));
    expect(screen.getByTestId("new-lead-dialog")).toBeInTheDocument();
  });

  it("activating Sign out calls signOut + redirects to /auth/sign-in", async () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-account-sign-out"));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("activating a placeholder command navigates to /dashboard/placeholder/<slug>", () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-show-hot"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/placeholder/hot-leads",
    );
  });

  it("activating Open lead by name… enters lookup sub-mode", () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-open-by-name"));
    expect(screen.getByTestId("command-palette")).toHaveAttribute(
      "data-mode",
      "lookup",
    );
    expect(screen.getByTestId("lookup-empty")).toBeInTheDocument();
  });

  it("typing in lookup mode debounces searchLeads and renders results", async () => {
    vi.useFakeTimers();
    mocks.searchLeads.mockResolvedValue({
      ok: true,
      results: [
        {
          id: "lead-77",
          label: "Priya Sharma",
          state: "qualified",
          phone: "+91-9000000000",
        },
      ],
    });
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-open-by-name"));
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "Priya" } });
    // Advance past the 200ms debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    vi.useRealTimers();
    await waitFor(() =>
      expect(screen.getByTestId("lookup-result-lead-77")).toBeInTheDocument(),
    );
    expect(mocks.searchLeads).toHaveBeenCalledOnce();
  });

  it("selecting a lookup result navigates to /dashboard/leads/<id>", async () => {
    mocks.searchLeads.mockResolvedValue({
      ok: true,
      results: [
        {
          id: "lead-99",
          label: "X",
          state: "new",
        },
      ],
    });
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-open-by-name"));
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "X" } });
    await waitFor(() =>
      expect(screen.getByTestId("lookup-result-lead-99")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("lookup-result-lead-99"));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/leads/lead-99");
  });

  it("Escape in lookup mode collapses back to catalog mode", () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-open-by-name"));
    expect(screen.getByTestId("command-palette")).toHaveAttribute(
      "data-mode",
      "lookup",
    );
    const input = screen.getByTestId("command-palette-input");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByTestId("command-palette")).toHaveAttribute(
      "data-mode",
      "catalog",
    );
  });

  it("renders no-results message when searchLeads returns empty", async () => {
    mocks.searchLeads.mockResolvedValue({ ok: true, results: [] });
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-open-by-name"));
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "noresults" } });
    await waitFor(() =>
      expect(screen.getByTestId("lookup-no-results")).toBeInTheDocument(),
    );
  });

  it("treats searchLeads error as empty results", async () => {
    mocks.searchLeads.mockResolvedValue({
      ok: false,
      error: "validation",
      message: "boom",
    });
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    fireEvent.click(screen.getByTestId("command-lead-open-by-name"));
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "x" } });
    await waitFor(() =>
      expect(screen.getByTestId("lookup-no-results")).toBeInTheDocument(),
    );
  });

  it("Toggle theme command flips data-theme on <html>", () => {
    renderPalette();
    act(() => {
      dispatchHotkey();
    });
    expect(document.documentElement.getAttribute("data-theme")).not.toBe(
      "dark",
    );
    fireEvent.click(screen.getByTestId("command-account-toggle-theme"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
