// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanvasHeader } from "@/components/canvas/canvas-header";
import { DEMO_LEAD } from "@/lib/canvas/fixture";

describe("CanvasHeader", () => {
  it("renders the lead label", () => {
    render(<CanvasHeader lead={DEMO_LEAD} />);
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
  });

  it("renders the state as a badge", () => {
    render(<CanvasHeader lead={DEMO_LEAD} />);
    expect(screen.getByTestId("state-badge").textContent).toBe(DEMO_LEAD.state);
  });

  it("renders only the 3 primary fields above the fold", () => {
    render(<CanvasHeader lead={DEMO_LEAD} />);
    const rows = screen.getAllByTestId("field-row");
    const keys = rows.map((r) => r.getAttribute("data-key")).sort();
    expect(keys).toEqual(["intent_score", "phone", "source"]);
  });
});
