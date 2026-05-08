// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ transitionLeadAction: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  transitionLeadAction: mocks.transitionLeadAction,
}));

import { TransitionReasonDialog } from "@/components/canvas/transition-reason-dialog";

const LEAD = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  mocks.transitionLeadAction.mockReset();
});

describe("TransitionReasonDialog", () => {
  it("rejects empty reason", async () => {
    const onClose = vi.fn();
    render(
      <TransitionReasonDialog
        open
        lead_id={LEAD}
        target_state="lost"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("reason-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("reason-error")).toBeInTheDocument(),
    );
    expect(mocks.transitionLeadAction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("submits with reason on click", async () => {
    mocks.transitionLeadAction.mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    render(
      <TransitionReasonDialog
        open
        lead_id={LEAD}
        target_state="junk"
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByTestId("reason-textarea"), {
      target: { value: "duplicate of #4221" },
    });
    fireEvent.click(screen.getByTestId("reason-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.transitionLeadAction).toHaveBeenCalledOnce();
    const fd = mocks.transitionLeadAction.mock.calls[0]![0] as FormData;
    expect(fd.get("lead_id")).toBe(LEAD);
    expect(fd.get("target_state")).toBe("junk");
    expect(fd.get("reason")).toBe("duplicate of #4221");
  });

  it("renders the action error and keeps dialog open on failure", async () => {
    mocks.transitionLeadAction.mockResolvedValue({
      ok: false,
      error: "validation",
      message: "illegal transition",
    });
    const onClose = vi.fn();
    render(
      <TransitionReasonDialog
        open
        lead_id={LEAD}
        target_state="lost"
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByTestId("reason-textarea"), {
      target: { value: "bad data" },
    });
    fireEvent.click(screen.getByTestId("reason-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("reason-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("reason-error").textContent).toContain(
      "illegal transition",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
