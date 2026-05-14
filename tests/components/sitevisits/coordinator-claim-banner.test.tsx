// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  claimCoordinationAction: vi.fn(async () => ({ ok: true as const })),
  releaseCoordinationAction: vi.fn(async () => ({ ok: true as const })),
  refresh: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dashboard/site-visits/actions", () => ({
  claimCoordinationAction: mocks.claimCoordinationAction,
  releaseCoordinationAction: mocks.releaseCoordinationAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { CoordinatorClaimBanner } from "@/components/sitevisits/coordinator-claim-banner";

describe("<CoordinatorClaimBanner>", () => {
  it("shows the claim button when unclaimed and the user can coordinate", () => {
    render(
      <CoordinatorClaimBanner
        date="2026-05-20"
        claimedBySelf={false}
        claimedByLabel={null}
        canCoordinate
      />,
    );
    expect(screen.getByTestId("sv-claim-btn")).toBeInTheDocument();
    expect(screen.getByTestId("sv-coordinator-unclaimed")).toBeInTheDocument();
  });

  it("hides the claim button when the user cannot coordinate", () => {
    render(
      <CoordinatorClaimBanner
        date="2026-05-20"
        claimedBySelf={false}
        claimedByLabel={null}
        canCoordinate={false}
      />,
    );
    expect(screen.queryByTestId("sv-claim-btn")).not.toBeInTheDocument();
  });

  it("shows the release button when claimed by the current user", () => {
    render(
      <CoordinatorClaimBanner
        date="2026-05-20"
        claimedBySelf
        claimedByLabel="You"
        canCoordinate
      />,
    );
    expect(screen.getByTestId("sv-release-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("sv-claim-btn")).not.toBeInTheDocument();
  });

  it("shows the claimant and no buttons when claimed by someone else", () => {
    render(
      <CoordinatorClaimBanner
        date="2026-05-20"
        claimedBySelf={false}
        claimedByLabel="Priya M"
        canCoordinate
      />,
    );
    expect(screen.getByText(/claimed by Priya M/)).toBeInTheDocument();
    expect(screen.queryByTestId("sv-claim-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sv-release-btn")).not.toBeInTheDocument();
  });
});
