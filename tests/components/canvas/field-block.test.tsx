// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FieldBlock } from "@/components/canvas/field-block";
import { DEMO_LEAD } from "@/lib/canvas/fixture";
import type { CanvasLead } from "@/lib/canvas/types";

describe("FieldBlock", () => {
  it("hides non-primary fields by default and shows them on toggle", () => {
    render(<FieldBlock lead={DEMO_LEAD} />);
    expect(screen.queryByTestId("more-panel")).toBeNull();

    fireEvent.click(screen.getByTestId("more-toggle"));
    const panel = screen.getByTestId("more-panel");
    expect(panel).toBeInTheDocument();
    const rows = screen.getAllByTestId("field-row");
    const keys = rows.map((r) => r.getAttribute("data-key")).sort();
    expect(keys).toEqual(["email", "notes"]);
    expect(screen.getByTestId("more-toggle").textContent).toBe("Less");
  });

  it("collapses again on second click (aria-expanded toggles)", () => {
    render(<FieldBlock lead={DEMO_LEAD} />);
    const toggle = screen.getByTestId("more-toggle");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("More");
  });

  it("renders nothing when there are no non-primary fields with content", () => {
    const sparse: CanvasLead = {
      ...DEMO_LEAD,
      data: {
        phone: "+91-9000000000",
        source: "other",
        intent_score: 10,
      },
    };
    const { container } = render(<FieldBlock lead={sparse} />);
    expect(container.firstChild).toBeNull();
  });
});
