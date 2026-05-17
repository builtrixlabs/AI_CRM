// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const addMock = vi.fn();
vi.mock(
  "@/app/(dashboard)/dashboard/leads/[id]/actions/add-comment",
  () => ({
    addCommentAction: (...a: unknown[]) =>
      addMock(...(a as Parameters<typeof addMock>)),
  }),
);

import { CommentsTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/comments-tab";
import type { CanvasComment } from "@/lib/canvas/types";

const LEAD = "11111111-2222-4333-8444-555555555555";

function comment(over: Partial<CanvasComment> = {}): CanvasComment {
  return {
    id: "c-1",
    body: "Customer asked for revised pricing.",
    created_at: "2026-05-15T10:00:00.000Z",
    created_by: "user-1234abcd",
    created_via: "manual",
    ...over,
  };
}

beforeEach(() => {
  addMock.mockReset();
});

describe("<CommentsTab>", () => {
  it("renders empty state when no comments + textarea enabled when canComment", () => {
    render(<CommentsTab leadId={LEAD} comments={[]} canComment={true} />);
    expect(screen.getByTestId("comments-tab-empty")).toBeDefined();
    expect(
      (screen.getByTestId("comments-tab-textarea") as HTMLTextAreaElement)
        .disabled,
    ).toBe(false);
  });

  it("disables the textarea + submit when canComment=false", () => {
    render(<CommentsTab leadId={LEAD} comments={[]} canComment={false} />);
    expect(
      (screen.getByTestId("comments-tab-textarea") as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("comments-tab-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("comments-tab-disabled")).toBeDefined();
  });

  it("renders existing comments DESC and shows the short actor id", () => {
    render(
      <CommentsTab
        leadId={LEAD}
        comments={[comment({ id: "c-A" }), comment({ id: "c-B" })]}
        canComment={true}
      />,
    );
    expect(screen.getByTestId("comment-row-c-A")).toBeDefined();
    expect(screen.getByTestId("comment-row-c-B")).toBeDefined();
  });

  it("calls addCommentAction(leadId, body) on submit", async () => {
    addMock.mockResolvedValue({ ok: true, comment_id: "new-1" });
    render(<CommentsTab leadId={LEAD} comments={[]} canComment={true} />);
    const ta = screen.getByTestId("comments-tab-textarea");
    fireEvent.change(ta, { target: { value: "Just spoke with customer." } });
    fireEvent.click(screen.getByTestId("comments-tab-submit"));
    await waitFor(() => expect(addMock).toHaveBeenCalledOnce());
    expect(addMock).toHaveBeenCalledWith(LEAD, "Just spoke with customer.");
  });

  it("surfaces server error from addCommentAction", async () => {
    addMock.mockResolvedValue({
      ok: false,
      error: "internal",
      message: "boom",
    });
    render(<CommentsTab leadId={LEAD} comments={[]} canComment={true} />);
    fireEvent.change(screen.getByTestId("comments-tab-textarea"), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByTestId("comments-tab-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("comments-tab-error").textContent).toMatch(
        /boom/,
      ),
    );
  });
});
