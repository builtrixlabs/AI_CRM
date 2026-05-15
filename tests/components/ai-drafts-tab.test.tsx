// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next/navigation router stub — useRouter().refresh() is invoked by the
// realtime subscription on INSERT events.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// SiteVisitBookingCard transitively imports the admin actions module which
// imports the supabase service-role client — that module throws under jsdom.
// We mock the admin actions module to break the import chain.
vi.mock("@/app/(admin)/admin/agents/queue/actions", () => ({
  submitSiteVisitBookingAction: vi.fn(),
  approveQueueItemAction: vi.fn(),
  rejectQueueItemAction: vi.fn(),
}));

// Same for the lead-canvas-scoped draft-actions module — server-only.
vi.mock(
  "@/app/(dashboard)/dashboard/leads/[id]/actions/draft-actions",
  () => ({
    approveDraftOnLeadAction: vi.fn(),
    rejectDraftOnLeadAction: vi.fn(),
    confirmSiteVisitOnLeadAction: vi.fn(),
  }),
);

// Browser supabase client stub — the realtime hook calls createSupabaseBrowserClient()
// when realtimePaused is false. We pause it in tests, but keep this mock as defense.
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on: () => undefined,
      subscribe: () => ({ unsubscribe: () => undefined }),
    }),
  }),
}));

import { AiDraftsTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/ai-drafts-tab";
import type { PendingDraft } from "@/lib/canvas/types";

const LEAD = "11111111-2222-4333-8444-555555555555";

function draft(over: Partial<PendingDraft> = {}): PendingDraft {
  return {
    id: "q-1",
    lead_id: LEAD,
    agent_kind: "brochure_send",
    channel: "whatsapp",
    draft_body: "Hi, sharing the floor plan.",
    created_at: "2026-05-14T10:00:00.000Z",
    attachments: [],
    error: null,
    ...over,
  };
}

describe("<AiDraftsTab>", () => {
  it("renders the empty state when drafts is empty", () => {
    render(
      <AiDraftsTab
        leadId={LEAD}
        drafts={[]}
        canApprove={true}
        realtimePaused={true}
      />,
    );
    expect(screen.getByTestId("ai-drafts-tab-empty")).toBeDefined();
    expect(screen.getByText(/No AI drafts pending/i)).toBeDefined();
  });

  it("renders a DraftCard for a brochure_send draft", () => {
    render(
      <AiDraftsTab
        leadId={LEAD}
        drafts={[draft()]}
        canApprove={true}
        realtimePaused={true}
      />,
    );
    expect(screen.getByTestId("draft-card-q-1")).toBeDefined();
    expect(screen.getByTestId("draft-approve-q-1")).toBeDefined();
  });

  it("renders a SiteVisitBookingCard for a site_visit_booking draft", () => {
    render(
      <AiDraftsTab
        leadId={LEAD}
        drafts={[draft({ id: "q-2", agent_kind: "site_visit_booking" })]}
        canApprove={true}
        realtimePaused={true}
      />,
    );
    expect(screen.getByTestId("site-visit-booking-card-q-2")).toBeDefined();
  });

  it("disables the approve button when canApprove=false (non-owner)", () => {
    render(
      <AiDraftsTab
        leadId={LEAD}
        drafts={[draft()]}
        canApprove={false}
        disabledReason="Only the assigned rep (or a manager) can approve."
        realtimePaused={true}
      />,
    );
    const approveBtn = screen.getByTestId(
      "draft-approve-q-1",
    ) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
    expect(screen.getByTestId("draft-disabled-q-1").textContent).toMatch(
      /Only the assigned rep/,
    );
  });

  it("disables the site-visit submit button when canApprove=false", () => {
    render(
      <AiDraftsTab
        leadId={LEAD}
        drafts={[draft({ id: "q-3", agent_kind: "site_visit_booking" })]}
        canApprove={false}
        disabledReason="Only the assigned rep can confirm visits."
        realtimePaused={true}
      />,
    );
    const submitBtn = screen.getByTestId(
      "site-visit-booking-submit-q-3",
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("renders a mix of draft types in order", () => {
    render(
      <AiDraftsTab
        leadId={LEAD}
        drafts={[
          draft({ id: "q-A", agent_kind: "brochure_send" }),
          draft({ id: "q-B", agent_kind: "site_visit_booking" }),
          draft({ id: "q-C", agent_kind: "follow_up_stale_lead" }),
        ]}
        canApprove={true}
        realtimePaused={true}
      />,
    );
    expect(screen.getByTestId("draft-card-q-A")).toBeDefined();
    expect(screen.getByTestId("site-visit-booking-card-q-B")).toBeDefined();
    expect(screen.getByTestId("draft-card-q-C")).toBeDefined();
  });
});
