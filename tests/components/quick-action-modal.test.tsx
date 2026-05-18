// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// QuickActionModal imports LEAD_STATES from @/lib/leads (re-exported through
// the barrel), which transitively pulls in the supabase admin client. That
// module throws under jsdom. Mock the admin to break the chain — we never
// hit it in this test because we mock the server action below.
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

const qaMock = vi.fn();
vi.mock(
  "@/app/(dashboard)/dashboard/leads/[id]/actions/quick-action",
  () => ({
    quickActionAction: (...a: unknown[]) =>
      qaMock(...(a as Parameters<typeof qaMock>)),
  }),
);

import { QuickActionModal } from "@/app/(dashboard)/dashboard/leads/[id]/quick-action/quick-action-modal";

const LEAD = "11111111-2222-4333-8444-555555555555";
const futureLocal = (() => {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();
const pastLocal = (() => {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

beforeEach(() => {
  qaMock.mockReset();
});

describe("<QuickActionModal>", () => {
  it("renders nothing when open=false", () => {
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={false}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByTestId("quick-action-modal")).toBeNull();
  });

  it("renders all three field controls when open", () => {
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("quick-action-comment")).toBeDefined();
    expect(screen.getByTestId("quick-action-status")).toBeDefined();
    expect(screen.getByTestId("quick-action-follow-up")).toBeDefined();
  });

  it("blocks save when all three fields are empty", () => {
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId("quick-action-save"));
    expect(screen.getByTestId("quick-action-error").textContent).toMatch(
      /at least one field/i,
    );
    expect(qaMock).not.toHaveBeenCalled();
  });

  it("blocks save when follow-up is in the past", () => {
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByTestId("quick-action-follow-up"), {
      target: { value: pastLocal },
    });
    fireEvent.click(screen.getByTestId("quick-action-save"));
    expect(screen.getByTestId("quick-action-error").textContent).toMatch(
      /future/i,
    );
    expect(qaMock).not.toHaveBeenCalled();
  });

  it("reveals the reason field when target_state is terminal", () => {
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByTestId("quick-action-reason")).toBeNull();
    fireEvent.change(screen.getByTestId("quick-action-status"), {
      target: { value: "lost" },
    });
    expect(screen.getByTestId("quick-action-reason")).toBeDefined();
  });

  it("blocks save when terminal + reason empty", () => {
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByTestId("quick-action-status"), {
      target: { value: "lost" },
    });
    fireEvent.click(screen.getByTestId("quick-action-save"));
    expect(screen.getByTestId("quick-action-error").textContent).toMatch(
      /reason is required/i,
    );
    expect(qaMock).not.toHaveBeenCalled();
  });

  it("calls quickActionAction with the populated payload", async () => {
    qaMock.mockResolvedValue({
      ok: true,
      comment_id: "c-1",
      state_changed: true,
      follow_up_set: false,
    });
    const onClose = vi.fn();
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByTestId("quick-action-comment"), {
      target: { value: "spoke with customer" },
    });
    fireEvent.change(screen.getByTestId("quick-action-status"), {
      target: { value: "qualified" },
    });
    fireEvent.click(screen.getByTestId("quick-action-save"));
    await waitFor(() => expect(qaMock).toHaveBeenCalledOnce());
    const [leadId, payload] = qaMock.mock.calls[0];
    expect(leadId).toBe(LEAD);
    expect(payload).toMatchObject({
      comment: "spoke with customer",
      target_state: "qualified",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click but NOT on panel click", () => {
    const onClose = vi.fn();
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={onClose}
      />,
    );
    // Panel click — should NOT close.
    fireEvent.click(screen.getByTestId("quick-action-panel"));
    expect(onClose).not.toHaveBeenCalled();
    // Backdrop click — should close.
    fireEvent.click(screen.getByTestId("quick-action-modal"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("locks body scroll while open and restores on unmount", () => {
    const { unmount } = render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("Cmd+Enter on the comment field submits", async () => {
    qaMock.mockResolvedValue({
      ok: true,
      comment_id: "c-1",
      state_changed: false,
      follow_up_set: false,
    });
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    const ta = screen.getByTestId("quick-action-comment");
    fireEvent.change(ta, { target: { value: "hi" } });
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    await waitFor(() => expect(qaMock).toHaveBeenCalledOnce());
  });

  it("shows server-side error when action returns ok=false", async () => {
    qaMock.mockResolvedValue({
      ok: false,
      error: "internal",
      message: "boom",
      step: "comment",
    });
    render(
      <QuickActionModal
        leadId={LEAD}
        currentState="contacted"
        open={true}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByTestId("quick-action-comment"), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByTestId("quick-action-follow-up"), {
      target: { value: futureLocal },
    });
    fireEvent.click(screen.getByTestId("quick-action-save"));
    await waitFor(() =>
      expect(screen.getByTestId("quick-action-error").textContent).toMatch(
        /boom/,
      ),
    );
  });
});
