// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecoveryQueueTable } from "@/components/recovery/recovery-queue-table";
import type {
  RecoveryQueueListRow,
  RecoveryReason,
} from "@/lib/recovery/types";

vi.mock("@/app/(dashboard)/dashboard/recovery/actions", () => ({
  claimRecoveryItemAction: vi.fn(),
  resolveRecoveryItemAction: vi.fn(),
}));

function row(over: Partial<RecoveryQueueListRow> = {}): RecoveryQueueListRow {
  return {
    id: "q-1",
    organization_id: "org-1",
    lead_id: "lead-1",
    recovery_reason: "lost" as RecoveryReason,
    added_at: "2026-05-19T10:00:00.000Z",
    claimed_by: null,
    claimed_at: null,
    resolved_at: null,
    resolution: null,
    note: null,
    lead_label: "Riya Sharma",
    lead_state: "lost",
    ...over,
  };
}

describe("<RecoveryQueueTable>", () => {
  it("renders the empty state when no rows", () => {
    render(
      <RecoveryQueueTable
        rows={[]}
        viewerId="u-1"
        canClaim
        canResolve
      />,
    );
    expect(screen.getByTestId("recovery-list-empty")).toBeTruthy();
  });

  it("renders lead label, reason badge, and a Claim button on an open row", () => {
    render(
      <RecoveryQueueTable
        rows={[row()]}
        viewerId="u-1"
        canClaim
        canResolve
      />,
    );
    expect(screen.getByText("Riya Sharma")).toBeTruthy();
    // Reason badge with the human label.
    expect(screen.getByText("Lost")).toBeTruthy();
    // Open status badge.
    expect(screen.getByText("open")).toBeTruthy();
    // Claim button rendered.
    expect(screen.getByTestId("recovery-claim-q-1")).toBeTruthy();
    // Resolve form NOT rendered (not yet claimed).
    expect(screen.queryByTestId("recovery-resolve-q-1")).toBeNull();
  });

  it("renders 'You' + a Resolve form on a row claimed by viewer", () => {
    render(
      <RecoveryQueueTable
        rows={[
          row({
            claimed_by: "u-1",
            claimed_at: "2026-05-19T11:00:00.000Z",
            recovery_reason: "stale_qualified",
          }),
        ]}
        viewerId="u-1"
        canClaim
        canResolve
      />,
    );
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("in progress")).toBeTruthy();
    expect(screen.getByText("Stale (qualified)")).toBeTruthy();
    expect(screen.getByTestId("recovery-resolve-q-1")).toBeTruthy();
  });

  it("renders the resolution badge on a resolved row + no action controls", () => {
    render(
      <RecoveryQueueTable
        rows={[
          row({
            claimed_by: "u-2",
            claimed_at: "2026-05-19T11:00:00.000Z",
            resolved_at: "2026-05-19T12:00:00.000Z",
            resolution: "won_back",
            recovery_reason: "on_hold",
          }),
        ]}
        viewerId="u-1"
        canClaim
        canResolve
      />,
    );
    expect(screen.getByText("won back")).toBeTruthy();
    expect(screen.getByText("On hold")).toBeTruthy();
    expect(screen.queryByTestId("recovery-claim-q-1")).toBeNull();
    expect(screen.queryByTestId("recovery-resolve-q-1")).toBeNull();
  });

  it("disables the Claim button when canClaim=false", () => {
    render(
      <RecoveryQueueTable
        rows={[row()]}
        viewerId="u-1"
        canClaim={false}
        canResolve={false}
      />,
    );
    const btn = screen.getByTestId("recovery-claim-q-1") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
