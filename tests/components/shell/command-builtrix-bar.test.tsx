// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandBuiltrixBar } from "@/components/shell/command-builtrix-bar";

describe("CommandBuiltrixBar", () => {
  it("renders the Cmd+K trigger surface with the keyboard hint", () => {
    render(<CommandBuiltrixBar />);
    expect(screen.getByLabelText("Open Command Builtrix")).toBeInTheDocument();
    expect(screen.getByText(/Command Builtrix/i)).toBeInTheDocument();
    expect(screen.getByText("⌘ K")).toBeInTheDocument();
  });

  it("dispatches a ⌘K keydown event when clicked", () => {
    const spy = vi.fn();
    document.addEventListener("keydown", spy);
    try {
      render(<CommandBuiltrixBar />);
      fireEvent.click(screen.getByLabelText("Open Command Builtrix"));
      expect(spy).toHaveBeenCalled();
      const evt = spy.mock.calls.at(-1)![0] as KeyboardEvent;
      expect(evt.key).toBe("k");
      expect(evt.metaKey).toBe(true);
      expect(evt.ctrlKey).toBe(true);
    } finally {
      document.removeEventListener("keydown", spy);
    }
  });
});
