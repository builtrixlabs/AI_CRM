// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueueItem, type QueueItemRow } from "@/app/(admin)/admin/agents/queue/queue-item";

vi.mock("@/app/(admin)/admin/agents/queue/actions", () => ({
  approveQueueItemAction: vi.fn(),
  rejectQueueItemAction: vi.fn(),
}));

function item(over: Partial<QueueItemRow> = {}): QueueItemRow {
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

describe("<QueueItem> — D-600 brochure rows", () => {
  it("renders the draft body in an editable textarea", () => {
    render(<QueueItem item={item()} />);
    // The card has two text controls (draft textarea + reject-reason input);
    // target the textarea by its pre-filled value.
    const ta = screen.getByDisplayValue(
      "Hi Rohit, sharing the floor plan.",
    ) as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
  });

  it("shows the brochure attachment title for a brochure_send row", () => {
    render(
      <QueueItem
        item={item({
          attachments: [
            {
              brochure_id: "broc-1",
              title: "3BHK floor plan",
              document_type: "floor_plan",
            },
          ],
        })}
      />,
    );
    const block = screen.getByTestId("queue-attachments-q-1");
    expect(block.textContent).toContain("3BHK floor plan");
    expect(block.textContent).toContain("floor plan");
  });

  it("surfaces the no_match error with a link to /admin/brochures", () => {
    render(<QueueItem item={item({ error: "no_match" })} />);
    const err = screen.getByTestId("queue-error-q-1");
    expect(err.textContent).toMatch(/no matching brochure/i);
    const link = screen.getByRole("link", { name: /\/admin\/brochures/ });
    expect(link.getAttribute("href")).toBe("/admin/brochures");
  });

  it("renders a plain follow-up row with neither attachment nor error block", () => {
    render(
      <QueueItem
        item={item({
          agent_kind: "follow_up_stale_lead",
          channel: "email",
          attachments: [],
          error: null,
        })}
      />,
    );
    expect(screen.queryByTestId("queue-attachments-q-1")).toBeNull();
    expect(screen.queryByTestId("queue-error-q-1")).toBeNull();
  });
});
