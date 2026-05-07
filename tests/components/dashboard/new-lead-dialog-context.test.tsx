// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, renderHook } from "@testing-library/react";

vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  createLeadAction: vi.fn(),
  updateLeadAction: vi.fn(),
  transitionLeadAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import {
  NewLeadDialogProvider,
  useNewLeadDialog,
} from "@/components/dashboard/new-lead-dialog-context";

describe("NewLeadDialogProvider + useNewLeadDialog", () => {
  it("dialog is closed by default", () => {
    function Probe() {
      const { isOpen } = useNewLeadDialog();
      return <div data-testid="probe">{isOpen ? "open" : "closed"}</div>;
    }
    render(
      <NewLeadDialogProvider>
        <Probe />
      </NewLeadDialogProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("closed");
    expect(screen.queryByTestId("new-lead-dialog")).toBeNull();
  });

  it("openDialog opens the dialog", () => {
    function Probe() {
      const { isOpen, openDialog } = useNewLeadDialog();
      return (
        <>
          <button data-testid="open-btn" onClick={openDialog}>
            open
          </button>
          <span data-testid="state">{isOpen ? "open" : "closed"}</span>
        </>
      );
    }
    render(
      <NewLeadDialogProvider>
        <Probe />
      </NewLeadDialogProvider>,
    );
    fireEvent.click(screen.getByTestId("open-btn"));
    expect(screen.getByTestId("state").textContent).toBe("open");
    expect(screen.getByTestId("new-lead-dialog")).toBeInTheDocument();
  });

  it("closeDialog closes the dialog", () => {
    function Probe() {
      const { isOpen, openDialog, closeDialog } = useNewLeadDialog();
      return (
        <>
          <button data-testid="open" onClick={openDialog}>open</button>
          <button data-testid="close" onClick={closeDialog}>close</button>
          <span data-testid="state">{isOpen ? "open" : "closed"}</span>
        </>
      );
    }
    render(
      <NewLeadDialogProvider>
        <Probe />
      </NewLeadDialogProvider>,
    );
    fireEvent.click(screen.getByTestId("open"));
    fireEvent.click(screen.getByTestId("close"));
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("does not render the inline trigger button (hideTrigger)", () => {
    render(
      <NewLeadDialogProvider>
        <span>child</span>
      </NewLeadDialogProvider>,
    );
    expect(screen.queryByTestId("new-lead-trigger")).toBeNull();
  });

  it("useNewLeadDialog throws outside the Provider", () => {
    const previousError = console.error;
    console.error = () => {};
    try {
      expect(() =>
        renderHook(() => useNewLeadDialog()),
      ).toThrow(/inside <NewLeadDialogProvider>/);
    } finally {
      console.error = previousError;
    }
  });
});
