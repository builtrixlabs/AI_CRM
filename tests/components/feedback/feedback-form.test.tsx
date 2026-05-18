// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dashboard/settings/feedback/actions", () => ({
  submitFeedbackAction: mocks.submit,
}));

import { FeedbackForm } from "@/components/feedback/feedback-form";

beforeEach(() => {
  mocks.submit.mockReset();
});

describe("<FeedbackForm> — D-617", () => {
  it("renders the category select + message textarea", () => {
    render(<FeedbackForm />);
    expect(screen.getByTestId("feedback-category")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-message")).toBeInTheDocument();
  });

  it("disables submit until the message is long enough", () => {
    render(<FeedbackForm />);
    const btn = screen.getByTestId("feedback-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "hi" },
    });
    expect(btn.disabled).toBe(true); // still < 3 chars
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "real feedback here" },
    });
    expect(btn.disabled).toBe(false);
  });

  it("submits the category + message and shows the sent state", async () => {
    mocks.submit.mockResolvedValue({ ok: true });
    render(<FeedbackForm />);
    fireEvent.change(screen.getByTestId("feedback-category"), {
      target: { value: "bug" },
    });
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "the thing is broken" },
    });
    fireEvent.click(screen.getByTestId("feedback-submit"));
    expect(mocks.submit).toHaveBeenCalledWith("bug", "the thing is broken");
    await waitFor(() =>
      expect(screen.getByTestId("feedback-sent")).toBeInTheDocument(),
    );
  });

  it("surfaces a validation error from the action", async () => {
    mocks.submit.mockResolvedValue({
      ok: false,
      reason: "validation",
      message: "too short",
    });
    render(<FeedbackForm />);
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "xyz" },
    });
    fireEvent.click(screen.getByTestId("feedback-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("feedback-error")).toBeInTheDocument(),
    );
  });
});
