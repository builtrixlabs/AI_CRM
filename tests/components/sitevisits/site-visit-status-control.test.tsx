// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  transitionSiteVisitAction: vi.fn(async () => ({ ok: true as const })),
  refresh: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dashboard/site-visits/actions", () => ({
  transitionSiteVisitAction: mocks.transitionSiteVisitAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { SiteVisitStatusControl } from "@/components/sitevisits/site-visit-status-control";

const ID = "44444444-5555-4666-8777-888888888888";

beforeEach(() => {
  mocks.transitionSiteVisitAction.mockClear();
  mocks.refresh.mockClear();
});

describe("<SiteVisitStatusControl>", () => {
  it("renders the terminal message when there are no allowed transitions", () => {
    render(
      <SiteVisitStatusControl id={ID} currentState="completed" allowed={[]} />,
    );
    expect(screen.getByTestId("sv-status-terminal")).toBeInTheDocument();
  });

  it("renders one button per allowed transition", () => {
    render(
      <SiteVisitStatusControl
        id={ID}
        currentState="scheduled"
        allowed={["confirmed", "in_progress", "cancelled"]}
      />,
    );
    expect(screen.getByTestId("sv-transition-confirmed")).toBeInTheDocument();
    expect(screen.getByTestId("sv-transition-in_progress")).toBeInTheDocument();
    expect(screen.getByTestId("sv-transition-cancelled")).toBeInTheDocument();
  });

  it("fires a non-reason transition immediately", () => {
    render(
      <SiteVisitStatusControl
        id={ID}
        currentState="scheduled"
        allowed={["confirmed"]}
      />,
    );
    fireEvent.click(screen.getByTestId("sv-transition-confirmed"));
    expect(mocks.transitionSiteVisitAction).toHaveBeenCalledWith(
      ID,
      "confirmed",
      undefined,
    );
  });

  it("reveals the reason box before firing a reason-required transition", () => {
    render(
      <SiteVisitStatusControl
        id={ID}
        currentState="scheduled"
        allowed={["cancelled"]}
      />,
    );
    fireEvent.click(screen.getByTestId("sv-transition-cancelled"));
    // First click reveals the reason box and does NOT call the action.
    expect(mocks.transitionSiteVisitAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("sv-reason-input")).toBeInTheDocument();
    expect(screen.getByTestId("sv-reason-confirm")).toBeInTheDocument();
  });

  it("submits the reason-required transition once a reason is entered", () => {
    render(
      <SiteVisitStatusControl
        id={ID}
        currentState="scheduled"
        allowed={["no_show"]}
      />,
    );
    fireEvent.click(screen.getByTestId("sv-transition-no_show"));
    fireEvent.change(screen.getByTestId("sv-reason-input"), {
      target: { value: "customer never arrived" },
    });
    fireEvent.click(screen.getByTestId("sv-reason-confirm"));
    expect(mocks.transitionSiteVisitAction).toHaveBeenCalledWith(
      ID,
      "no_show",
      "customer never arrived",
    );
  });
});
