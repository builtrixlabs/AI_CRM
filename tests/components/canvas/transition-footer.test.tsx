// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ transitionLeadAction: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  transitionLeadAction: mocks.transitionLeadAction,
}));

import { TransitionFooter } from "@/components/canvas/transition-footer";

const LEAD = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  mocks.transitionLeadAction.mockReset();
});

describe("TransitionFooter (active states)", () => {
  it("from 'new' renders 5 buttons (contacted, qualified, lost, on_hold, junk)", () => {
    render(<TransitionFooter lead_id={LEAD} current_state="new" />);
    expect(screen.getByTestId("transition-footer").getAttribute("data-terminal")).toBe(
      "false",
    );
    expect(screen.getByTestId("transition-contacted")).toBeInTheDocument();
    expect(screen.getByTestId("transition-qualified")).toBeInTheDocument();
    expect(screen.getByTestId("transition-lost")).toBeInTheDocument();
    expect(screen.getByTestId("transition-on_hold")).toBeInTheDocument();
    expect(screen.getByTestId("transition-junk")).toBeInTheDocument();
  });

  it("from 'contacted' renders 4 buttons (qualified, lost, on_hold, junk)", () => {
    render(<TransitionFooter lead_id={LEAD} current_state="contacted" />);
    expect(screen.getByTestId("transition-qualified")).toBeInTheDocument();
    expect(screen.queryByTestId("transition-contacted")).toBeNull();
    expect(screen.getByTestId("transition-lost")).toBeInTheDocument();
  });

  it("from 'qualified' renders 3 terminal buttons only", () => {
    render(<TransitionFooter lead_id={LEAD} current_state="qualified" />);
    expect(screen.queryByTestId("transition-contacted")).toBeNull();
    expect(screen.queryByTestId("transition-qualified")).toBeNull();
    expect(screen.getByTestId("transition-lost")).toBeInTheDocument();
    expect(screen.getByTestId("transition-on_hold")).toBeInTheDocument();
    expect(screen.getByTestId("transition-junk")).toBeInTheDocument();
  });
});

describe("TransitionFooter (terminal states)", () => {
  it.each(["lost", "on_hold", "junk"] as const)(
    "from '%s' renders terminal copy and zero buttons",
    (s) => {
      render(<TransitionFooter lead_id={LEAD} current_state={s} />);
      const footer = screen.getByTestId("transition-footer");
      expect(footer.getAttribute("data-terminal")).toBe("true");
      expect(footer.textContent).toMatch(/Terminal/);
      expect(screen.queryByTestId(`transition-${s}`)).toBeNull();
    },
  );
});

describe("TransitionFooter actions", () => {
  it("forward click dispatches the action directly (no reason dialog)", async () => {
    mocks.transitionLeadAction.mockResolvedValue({ ok: true });
    render(<TransitionFooter lead_id={LEAD} current_state="new" />);
    fireEvent.click(screen.getByTestId("transition-contacted"));
    await waitFor(() =>
      expect(mocks.transitionLeadAction).toHaveBeenCalledOnce(),
    );
    expect(screen.queryByTestId("transition-reason-dialog")).toBeNull();
    const fd = mocks.transitionLeadAction.mock.calls[0]![0] as FormData;
    expect(fd.get("target_state")).toBe("contacted");
  });

  it("terminal click opens the reason dialog (no immediate action call)", () => {
    render(<TransitionFooter lead_id={LEAD} current_state="new" />);
    fireEvent.click(screen.getByTestId("transition-lost"));
    expect(screen.getByTestId("transition-reason-dialog")).toBeInTheDocument();
    expect(mocks.transitionLeadAction).not.toHaveBeenCalled();
  });

  it("renders the action error message on forward failure", async () => {
    mocks.transitionLeadAction.mockResolvedValue({
      ok: false,
      error: "unknown",
      message: "boom",
    });
    render(<TransitionFooter lead_id={LEAD} current_state="new" />);
    fireEvent.click(screen.getByTestId("transition-contacted"));
    await waitFor(() =>
      expect(screen.getByTestId("transition-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("transition-error").textContent).toContain("boom");
  });
});
