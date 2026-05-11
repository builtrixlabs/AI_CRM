// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { transitionDealStageActionMock } = vi.hoisted(() => ({
  transitionDealStageActionMock: vi.fn(),
}));

vi.mock("@/app/(dashboard)/dashboard/deals/[id]/actions", () => ({
  transitionDealStageAction: transitionDealStageActionMock,
  transitionDealStageFormAction: vi.fn(),
}));

import { DealStageTracker } from "@/components/canvas/deal-stage-tracker";
import type { StageTransition } from "@/lib/booking/types";

const baseTransitions: StageTransition[] = [
  {
    id: "t-1",
    deal_id: "d-1",
    organization_id: "o-1",
    from_stage: null,
    to_stage: "eoi",
    actor_user_id: null,
    actor_kind: "system",
    triggered_by: "migration:20260511220000",
    evidence: { backfill: true },
    idempotency_key: "k-1",
    skip_reason: null,
    correction_reason: null,
    occurred_at: "2026-05-11T10:00:00Z",
  },
];

beforeEach(() => {
  transitionDealStageActionMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("<DealStageTracker>", () => {
  it("renders all 8 stages with the current stage marked aria-current=step", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="token"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    for (const s of [
      "eoi",
      "token",
      "booking",
      "sale_agreement",
      "loan_finance",
      "registration",
      "possession",
      "handover_complete",
    ]) {
      expect(screen.getByTestId(`stage-chip-${s}`)).toBeInTheDocument();
    }
    expect(
      screen.getByTestId("stage-chip-token").getAttribute("aria-current"),
    ).toBe("step");
    expect(
      screen.getByTestId("stage-chip-eoi").getAttribute("aria-current"),
    ).toBeNull();
  });

  it("renders the transition history with from → to text", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="eoi"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    const row = screen.getByTestId("history-row-t-1");
    expect(row.textContent).toMatch(/— → eoi/);
    expect(screen.getByText(/History \(1\)/)).toBeInTheDocument();
  });

  it("renders the empty-state copy when there are no transitions", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="eoi"
        transitions={[]}
        isOrgAdmin={false}
      />,
    );
    expect(screen.getByText("No transitions yet.")).toBeInTheDocument();
  });

  it("hides the rollback button for non-admin users", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="token"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    expect(screen.queryByTestId("rollback-stage-button")).toBeNull();
  });

  it("shows the rollback button for org admins", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="token"
        transitions={baseTransitions}
        isOrgAdmin={true}
      />,
    );
    expect(screen.getByTestId("rollback-stage-button")).toBeInTheDocument();
  });

  it("hides the rollback button at eoi even for admins (nothing to roll back to)", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="eoi"
        transitions={baseTransitions}
        isOrgAdmin={true}
      />,
    );
    expect(screen.queryByTestId("rollback-stage-button")).toBeNull();
  });

  it("hides the advance button at the terminal stage", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="handover_complete"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    expect(screen.queryByTestId("advance-stage-button")).toBeNull();
  });

  it("opens the advance dialog when the advance button is clicked", () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="eoi"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    fireEvent.click(screen.getByTestId("advance-stage-button"));
    expect(screen.getByTestId("advance-stage-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-textarea")).toBeInTheDocument();
  });

  it("submits the advance form with stage + evidence + auto-generated idempotency_key", async () => {
    transitionDealStageActionMock.mockResolvedValueOnce({
      ok: true,
      transition_id: "new-id",
    });
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="eoi"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    fireEvent.click(screen.getByTestId("advance-stage-button"));
    const textarea = screen.getByTestId("evidence-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: '{"receipt_no":"X-1"}' },
    });
    fireEvent.click(screen.getByTestId("advance-submit"));

    await waitFor(() => {
      expect(transitionDealStageActionMock).toHaveBeenCalledTimes(1);
    });
    const fd = transitionDealStageActionMock.mock.calls[0]![0] as FormData;
    expect(fd.get("deal_id")).toBe("d-1");
    expect(fd.get("to_stage")).toBe("token");
    expect(JSON.parse(fd.get("evidence") as string)).toEqual({
      receipt_no: "X-1",
    });
    // Default Select choice is canonical next (token), so no skip_reason.
    expect(fd.get("skip_reason")).toBe(null);
  });

  it("rejects invalid JSON evidence", async () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="eoi"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    fireEvent.click(screen.getByTestId("advance-stage-button"));
    fireEvent.change(screen.getByTestId("evidence-textarea"), {
      target: { value: "not-json" },
    });
    fireEvent.click(screen.getByTestId("advance-submit"));
    expect(screen.getByTestId("advance-error").textContent).toMatch(
      /must be valid JSON/,
    );
    expect(transitionDealStageActionMock).not.toHaveBeenCalled();
  });

  it("rejects empty-object evidence", async () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="eoi"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    fireEvent.click(screen.getByTestId("advance-stage-button"));
    fireEvent.change(screen.getByTestId("evidence-textarea"), {
      target: { value: "{}" },
    });
    fireEvent.click(screen.getByTestId("advance-submit"));
    expect(screen.getByTestId("advance-error").textContent).toMatch(
      /non-empty JSON object/,
    );
    expect(transitionDealStageActionMock).not.toHaveBeenCalled();
  });

  it("surfaces server-action errors", async () => {
    transitionDealStageActionMock.mockResolvedValueOnce({
      ok: false,
      error: "invalid_transition",
      message: "from=token to=sale_agreement",
    });
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="token"
        transitions={baseTransitions}
        isOrgAdmin={false}
      />,
    );
    fireEvent.click(screen.getByTestId("advance-stage-button"));
    fireEvent.change(screen.getByTestId("evidence-textarea"), {
      target: { value: '{"x":1}' },
    });
    fireEvent.click(screen.getByTestId("advance-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("advance-error").textContent).toMatch(
        /from=token to=sale_agreement/,
      );
    });
  });

  it("opens the rollback dialog and submits with correction_reason + canned evidence", async () => {
    transitionDealStageActionMock.mockResolvedValueOnce({
      ok: true,
      transition_id: "rb-id",
    });
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="token"
        transitions={baseTransitions}
        isOrgAdmin={true}
      />,
    );
    fireEvent.click(screen.getByTestId("rollback-stage-button"));
    expect(screen.getByTestId("rollback-stage-dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("rollback-reason"), {
      target: { value: "Token receipt was for a different deal" },
    });
    fireEvent.click(screen.getByTestId("rollback-submit"));

    await waitFor(() => {
      expect(transitionDealStageActionMock).toHaveBeenCalledTimes(1);
    });
    const fd = transitionDealStageActionMock.mock.calls[0]![0] as FormData;
    expect(fd.get("deal_id")).toBe("d-1");
    expect(fd.get("to_stage")).toBe("eoi");
    expect(fd.get("correction_reason")).toBe(
      "Token receipt was for a different deal",
    );
    const ev = JSON.parse(fd.get("evidence") as string);
    expect(ev.correction).toBe(true);
    expect(ev.reason).toBe("Token receipt was for a different deal");
  });

  it("requires non-empty correction reason on rollback", async () => {
    render(
      <DealStageTracker
        dealId="d-1"
        currentStage="token"
        transitions={baseTransitions}
        isOrgAdmin={true}
      />,
    );
    fireEvent.click(screen.getByTestId("rollback-stage-button"));
    fireEvent.click(screen.getByTestId("rollback-submit"));
    expect(screen.getByTestId("rollback-error").textContent).toMatch(
      /Correction reason is required/,
    );
    expect(transitionDealStageActionMock).not.toHaveBeenCalled();
  });
});
