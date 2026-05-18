// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingQueueItem } from "@/app/(admin)/admin/directives/pending/pending-queue";
import type { PendingWorkflowRow } from "@/lib/doe/authoring";

const approveWorkflowAction = vi.fn();
const rejectWorkflowAction = vi.fn();
vi.mock("@/app/(admin)/admin/directives/pending/actions", () => ({
  approveWorkflowAction: (...a: unknown[]) => approveWorkflowAction(...a),
  rejectWorkflowAction: (...a: unknown[]) => rejectWorkflowAction(...a),
}));

function workflow(over: Partial<PendingWorkflowRow> = {}): PendingWorkflowRow {
  return {
    id: "dir-1",
    code: "C-07",
    display_name: "Manager workflow",
    trigger_kind: "lead.created",
    action_kind: "flag_lead",
    tier: "T1",
    submitted_by: "user-1",
    submitted_at: "2026-05-15T00:00:00Z",
    created_at: "2026-05-15T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  approveWorkflowAction.mockReset();
  rejectWorkflowAction.mockReset();
});

describe("<PendingQueueItem>", () => {
  it("renders the workflow code, name, trigger, and action (AC-7)", () => {
    render(<PendingQueueItem workflow={workflow()} />);
    const card = screen.getByTestId("pending-workflow-dir-1");
    expect(card.textContent).toContain("C-07");
    expect(card.textContent).toContain("Manager workflow");
    expect(card.textContent).toContain("lead.created");
    expect(card.textContent).toContain("flag_lead");
  });

  it("approve calls approveWorkflowAction and shows the approved state", async () => {
    approveWorkflowAction.mockResolvedValue({ ok: true });
    render(<PendingQueueItem workflow={workflow()} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => {
      expect(approveWorkflowAction).toHaveBeenCalledWith("dir-1");
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("pending-workflow-dir-1").textContent,
      ).toMatch(/now live/i);
    });
  });

  it("reject with a too-short reason shows an error and does not call the action (AC-5)", () => {
    render(<PendingQueueItem workflow={workflow()} />);
    fireEvent.change(screen.getByPlaceholderText(/reject reason/i), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(screen.getByTestId("pending-error-dir-1")).toBeTruthy();
    expect(rejectWorkflowAction).not.toHaveBeenCalled();
  });

  it("reject with a valid reason calls rejectWorkflowAction and shows archived", async () => {
    rejectWorkflowAction.mockResolvedValue({ ok: true });
    render(<PendingQueueItem workflow={workflow()} />);
    fireEvent.change(screen.getByPlaceholderText(/reject reason/i), {
      target: { value: "this trigger threshold is too aggressive" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => {
      expect(rejectWorkflowAction).toHaveBeenCalledWith(
        "dir-1",
        "this trigger threshold is too aggressive",
      );
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("pending-workflow-dir-1").textContent,
      ).toMatch(/archived/i);
    });
  });

  it("surfaces a server error from approve", async () => {
    approveWorkflowAction.mockResolvedValue({
      ok: false,
      error: "conflict",
      message: "not pending",
    });
    render(<PendingQueueItem workflow={workflow()} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => {
      expect(
        screen.getByTestId("pending-error-dir-1").textContent,
      ).toMatch(/not pending/i);
    });
  });
});
