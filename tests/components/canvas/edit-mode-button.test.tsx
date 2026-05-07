// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditModeButton } from "@/components/canvas/edit-mode-button";

describe("EditModeButton", () => {
  it("renders 'Edit' when editing=false", () => {
    render(<EditModeButton editing={false} onToggle={() => {}} />);
    const btn = screen.getByTestId("edit-mode-toggle");
    expect(btn.textContent).toBe("Edit");
    expect(btn.getAttribute("data-editing")).toBe("false");
  });

  it("renders 'Cancel' when editing=true", () => {
    render(<EditModeButton editing={true} onToggle={() => {}} />);
    expect(screen.getByTestId("edit-mode-toggle").textContent).toBe("Cancel");
  });

  it("invokes onToggle on click", () => {
    const fn = vi.fn();
    render(<EditModeButton editing={false} onToggle={fn} />);
    fireEvent.click(screen.getByTestId("edit-mode-toggle"));
    expect(fn).toHaveBeenCalledOnce();
  });
});
