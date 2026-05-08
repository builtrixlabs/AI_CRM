// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ updateLeadAction: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  updateLeadAction: mocks.updateLeadAction,
}));

import { EditLeadForm } from "@/components/canvas/edit-lead-form";
import { DEMO_LEAD } from "@/lib/canvas/fixture";

beforeEach(() => {
  mocks.updateLeadAction.mockReset();
});

describe("EditLeadForm", () => {
  it("initial values reflect the lead's data", () => {
    render(
      <EditLeadForm lead={DEMO_LEAD} onSaved={() => {}} onCancel={() => {}} />,
    );
    expect((screen.getByTestId("edit-label") as HTMLInputElement).value).toBe(
      DEMO_LEAD.label,
    );
    expect((screen.getByTestId("edit-phone") as HTMLInputElement).value).toBe(
      String(DEMO_LEAD.data.phone),
    );
    expect((screen.getByTestId("edit-notes") as HTMLTextAreaElement).value).toBe(
      String(DEMO_LEAD.data.notes ?? ""),
    );
  });

  it("Cancel calls onCancel without dispatching the action", () => {
    const onCancel = vi.fn();
    const onSaved = vi.fn();
    render(
      <EditLeadForm lead={DEMO_LEAD} onSaved={onSaved} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("edit-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.updateLeadAction).not.toHaveBeenCalled();
  });

  it("Save dispatches updateLeadAction with the form values", async () => {
    mocks.updateLeadAction.mockResolvedValue({ ok: true });
    const onSaved = vi.fn();
    render(
      <EditLeadForm lead={DEMO_LEAD} onSaved={onSaved} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByTestId("edit-notes"), {
      target: { value: "follow-up tomorrow" },
    });
    fireEvent.click(screen.getByTestId("edit-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.updateLeadAction).toHaveBeenCalledOnce();
    const [id, fd] = mocks.updateLeadAction.mock.calls[0]!;
    expect(id).toBe(DEMO_LEAD.id);
    expect((fd as FormData).get("notes")).toBe("follow-up tomorrow");
  });

  it("renders inline field errors from the action", async () => {
    mocks.updateLeadAction.mockResolvedValue({
      ok: false,
      error: "validation",
      fieldErrors: { phone: "Phone is too short" },
    });
    render(
      <EditLeadForm lead={DEMO_LEAD} onSaved={() => {}} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("edit-save"));
    await waitFor(() =>
      expect(screen.getByText("Phone is too short")).toBeInTheDocument(),
    );
  });

  it("supports typing into label / phone / email", () => {
    render(
      <EditLeadForm lead={DEMO_LEAD} onSaved={() => {}} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByTestId("edit-label"), {
      target: { value: "Renamed" },
    });
    fireEvent.change(screen.getByTestId("edit-phone"), {
      target: { value: "+91-9111111112" },
    });
    fireEvent.change(screen.getByTestId("edit-email"), {
      target: { value: "x@y.com" },
    });
    expect(
      (screen.getByTestId("edit-label") as HTMLInputElement).value,
    ).toBe("Renamed");
    expect(
      (screen.getByTestId("edit-email") as HTMLInputElement).value,
    ).toBe("x@y.com");
  });

  it("submits with email + label included when present", async () => {
    mocks.updateLeadAction.mockResolvedValue({ ok: true });
    render(
      <EditLeadForm lead={DEMO_LEAD} onSaved={() => {}} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByTestId("edit-email"), {
      target: { value: "p2@example.com" },
    });
    fireEvent.click(screen.getByTestId("edit-save"));
    await waitFor(() => expect(mocks.updateLeadAction).toHaveBeenCalledOnce());
    const fd = mocks.updateLeadAction.mock.calls[0]![1] as FormData;
    expect(fd.get("email")).toBe("p2@example.com");
    expect(fd.get("label")).toBe(DEMO_LEAD.label);
  });

  it("renders form-level error on unknown failure", async () => {
    mocks.updateLeadAction.mockResolvedValue({
      ok: false,
      error: "unknown",
      message: "boom",
    });
    render(
      <EditLeadForm lead={DEMO_LEAD} onSaved={() => {}} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("edit-save"));
    await waitFor(() =>
      expect(screen.getByTestId("form-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("form-error").textContent).toContain("boom");
  });
});
