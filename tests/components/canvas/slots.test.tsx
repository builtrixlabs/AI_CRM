// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuggestedActionSlot } from "@/components/canvas/suggested-action-slot";
import { AgentPanelSlot } from "@/components/canvas/agent-panel-slot";

describe("SuggestedActionSlot", () => {
  it("renders empty-state copy when no children are passed", () => {
    render(<SuggestedActionSlot />);
    const slot = screen.getByTestId("suggested-action");
    expect(slot.getAttribute("data-empty")).toBe("true");
    expect(screen.getByText(/No suggestions yet/i)).toBeInTheDocument();
    expect(screen.getByText("D-011").getAttribute("href")).toBe(
      "/admin/directives",
    );
  });

  it("renders provided children and marks data-empty=false", () => {
    render(
      <SuggestedActionSlot>
        <p>future content</p>
      </SuggestedActionSlot>,
    );
    expect(screen.getByText("future content")).toBeInTheDocument();
    expect(screen.getByTestId("suggested-action").getAttribute("data-empty")).toBe(
      "false",
    );
  });
});

describe("AgentPanelSlot", () => {
  it("renders empty-state copy when no children are passed", () => {
    render(<AgentPanelSlot />);
    const slot = screen.getByTestId("agent-panel");
    expect(slot.getAttribute("data-empty")).toBe("true");
    expect(screen.getByText(/No agent activity yet/i)).toBeInTheDocument();
    expect(screen.getByText("D-009").getAttribute("href")).toBe("/admin/agents");
  });

  it("renders provided children and marks data-empty=false", () => {
    render(
      <AgentPanelSlot>
        <p>future agent content</p>
      </AgentPanelSlot>,
    );
    expect(screen.getByText("future agent content")).toBeInTheDocument();
    expect(screen.getByTestId("agent-panel").getAttribute("data-empty")).toBe(
      "false",
    );
  });
});
