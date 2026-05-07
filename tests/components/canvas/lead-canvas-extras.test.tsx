// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  createLeadAction: vi.fn(),
  updateLeadAction: vi.fn(),
  transitionLeadAction: vi.fn(),
}));

import { LeadCanvas } from "@/components/canvas/lead-canvas";
import { DEMO_LEAD, DEMO_ACTIVITIES } from "@/lib/canvas/fixture";

describe("LeadCanvas extras (D-007)", () => {
  it("default props preserve D-006 read-only behavior (no edit, no footer)", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        demo
      />,
    );
    expect(screen.queryByTestId("edit-mode-toggle")).toBeNull();
    expect(screen.queryByTestId("section-transition")).toBeNull();
  });

  it("canEdit shows edit-mode toggle and switches to form on click", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        canEdit
      />,
    );
    const toggle = screen.getByTestId("edit-mode-toggle");
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByTestId("section-edit")).toBeInTheDocument();
    expect(screen.queryByTestId("section-fields")).toBeNull();
    expect(screen.queryByTestId("section-header")).toBeNull();
  });

  it("Cancel from edit form returns to view mode", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        canEdit
      />,
    );
    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    fireEvent.click(screen.getByTestId("edit-cancel"));
    expect(screen.queryByTestId("section-edit")).toBeNull();
    expect(screen.getByTestId("section-header")).toBeInTheDocument();
  });

  it("canTransition renders the transition footer with state-machine buttons", () => {
    render(
      <LeadCanvas
        lead={{ ...DEMO_LEAD, state: "new" }}
        initialActivities={DEMO_ACTIVITIES}
        canTransition
      />,
    );
    expect(screen.getByTestId("section-transition")).toBeInTheDocument();
    expect(screen.getByTestId("transition-contacted")).toBeInTheDocument();
  });

  it("canTransition for terminal state shows terminal copy", () => {
    render(
      <LeadCanvas
        lead={{ ...DEMO_LEAD, state: "lost" }}
        initialActivities={DEMO_ACTIVITIES}
        canTransition
      />,
    );
    expect(
      screen.getByTestId("transition-footer").getAttribute("data-terminal"),
    ).toBe("true");
  });

  it("canEdit + schema-mismatch suppresses the edit toggle (would crash form)", () => {
    render(
      <LeadCanvas
        lead={{ ...DEMO_LEAD, data: { phone: 123 } as never }}
        initialActivities={DEMO_ACTIVITIES}
        canEdit
      />,
    );
    expect(screen.queryByTestId("edit-mode-toggle")).toBeNull();
    expect(screen.getByTestId("section-schema-mismatch")).toBeInTheDocument();
  });
});
