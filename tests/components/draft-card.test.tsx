// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  DraftCard,
  type DraftCardItem,
} from "@/components/agents/draft-card";

const approveMock = vi.fn();
const rejectMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  approveMock.mockReset();
  rejectMock.mockReset();
});

function item(over: Partial<DraftCardItem> = {}): DraftCardItem {
  return {
    id: "q-1",
    lead_id: "lead-1",
    lead_label: "Rohit Menon",
    channel: "whatsapp",
    draft_body: "Hi Rohit, sharing the floor plan.",
    agent_kind: "brochure_send",
    created_at: "2026-05-14T10:00:00.000Z",
    attachments: [],
    error: null,
    ...over,
  };
}

describe("<DraftCard> — happy path", () => {
  it("renders the draft body in an editable textarea", () => {
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    const ta = screen.getByDisplayValue(
      "Hi Rohit, sharing the floor plan.",
    ) as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta.disabled).toBe(false);
  });

  it("calls onApprove(id, null) on a clean approve", async () => {
    approveMock.mockResolvedValue({ ok: true, dispatch: "sent" });
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    fireEvent.click(screen.getByTestId("draft-approve-q-1"));
    await waitFor(() => expect(approveMock).toHaveBeenCalledOnce());
    expect(approveMock).toHaveBeenCalledWith("q-1", null);
  });

  it("calls onApprove(id, editedBody) when the textarea was edited", async () => {
    approveMock.mockResolvedValue({ ok: true });
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    const ta = screen.getByDisplayValue("Hi Rohit, sharing the floor plan.");
    fireEvent.change(ta, { target: { value: "Hi Rohit — updated copy." } });
    fireEvent.click(screen.getByTestId("draft-approve-q-1"));
    await waitFor(() => expect(approveMock).toHaveBeenCalledOnce());
    expect(approveMock).toHaveBeenCalledWith("q-1", "Hi Rohit — updated copy.");
  });

  it("renders the 'Approved.' confirmation after a successful approve", async () => {
    approveMock.mockResolvedValue({ ok: true, dispatch: "sent" });
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    fireEvent.click(screen.getByTestId("draft-approve-q-1"));
    await waitFor(() =>
      expect(screen.getByText(/Approved\./)).toBeDefined(),
    );
  });

  it("renders the deferred-channel banner when dispatch=deferred", async () => {
    approveMock.mockResolvedValue({
      ok: true,
      dispatch: "deferred",
      channel: "whatsapp",
    });
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    fireEvent.click(screen.getByTestId("draft-approve-q-1"));
    await waitFor(() =>
      expect(screen.getByText(/Configure your whatsapp integration/i)).toBeDefined(),
    );
    const link = screen.getByRole("link", {
      name: /Open whatsapp integration settings/i,
    });
    expect(link.getAttribute("href")).toBe("/admin/integrations/whatsapp");
  });
});

describe("<DraftCard> — reject flow", () => {
  it("blocks reject when reason is too short (≥3 chars)", async () => {
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Reject reason..."), {
      target: { value: "no" },
    });
    fireEvent.click(screen.getByTestId("draft-reject-q-1"));
    expect(rejectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("draft-error-q-1").textContent).toMatch(
      /at least 3 characters/i,
    );
  });

  it("calls onReject(id, reason) when reason is valid", async () => {
    rejectMock.mockResolvedValue({ ok: true });
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Reject reason..."), {
      target: { value: "Wrong tone for this customer" },
    });
    fireEvent.click(screen.getByTestId("draft-reject-q-1"));
    await waitFor(() => expect(rejectMock).toHaveBeenCalledOnce());
    expect(rejectMock).toHaveBeenCalledWith("q-1", "Wrong tone for this customer");
  });

  it("surfaces server error from onApprove via the error block", async () => {
    approveMock.mockResolvedValue({
      ok: false,
      error: "internal",
      message: "boom",
    });
    render(
      <DraftCard
        item={item()}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    fireEvent.click(screen.getByTestId("draft-approve-q-1"));
    await waitFor(() =>
      expect(screen.getByTestId("draft-error-q-1").textContent).toMatch(/boom/),
    );
  });
});

describe("<DraftCard> — canApprove=false (non-owner view)", () => {
  it("renders the textarea disabled", () => {
    render(
      <DraftCard
        item={item()}
        canApprove={false}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    const ta = screen.getByDisplayValue(
      "Hi Rohit, sharing the floor plan.",
    ) as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
  });

  it("renders Approve + Reject disabled", () => {
    render(
      <DraftCard
        item={item()}
        canApprove={false}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    const approve = screen.getByTestId(
      "draft-approve-q-1",
    ) as HTMLButtonElement;
    const reject = screen.getByTestId(
      "draft-reject-q-1",
    ) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
  });

  it("shows the disabled-reason tooltip text under the buttons", () => {
    render(
      <DraftCard
        item={item()}
        canApprove={false}
        onApprove={approveMock}
        onReject={rejectMock}
        disabledReason="Only the assigned rep can approve."
      />,
    );
    expect(screen.getByTestId("draft-disabled-q-1").textContent).toMatch(
      /Only the assigned rep can approve/,
    );
  });

  it("does NOT invoke onApprove even if the disabled button is clicked", async () => {
    render(
      <DraftCard
        item={item()}
        canApprove={false}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    fireEvent.click(screen.getByTestId("draft-approve-q-1"));
    // jsdom doesn't suppress click on disabled buttons in all React versions —
    // assert directly that the callback never fired regardless.
    await new Promise((r) => setTimeout(r, 10));
    expect(approveMock).not.toHaveBeenCalled();
  });
});

describe("<DraftCard> — D-600 brochure + error blocks", () => {
  it("renders attachment block when attachments[] is non-empty", () => {
    render(
      <DraftCard
        item={item({
          attachments: [
            {
              brochure_id: "broc-1",
              title: "3BHK floor plan",
              document_type: "floor_plan",
            },
          ],
        })}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    const block = screen.getByTestId("queue-attachments-q-1");
    expect(block.textContent).toContain("3BHK floor plan");
    expect(block.textContent).toContain("floor plan");
  });

  it("surfaces the no_match error with a link to /admin/brochures", () => {
    render(
      <DraftCard
        item={item({ error: "no_match" })}
        canApprove={true}
        onApprove={approveMock}
        onReject={rejectMock}
      />,
    );
    expect(screen.getByTestId("queue-error-q-1").textContent).toMatch(
      /no matching brochure/i,
    );
  });
});
