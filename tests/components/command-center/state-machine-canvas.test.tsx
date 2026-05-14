// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateMachineCanvas } from "@/components/command-center/state-machine-canvas";

describe("<StateMachineCanvas> — D-605 lead-state distribution", () => {
  it("renders a row per lead state with the total", () => {
    render(
      <StateMachineCanvas
        states={[
          { state: "new", count: 10 },
          { state: "contacted", count: 6 },
          { state: "qualified", count: 4 },
        ]}
      />,
    );
    expect(screen.getByTestId("cc-state-new")).toBeInTheDocument();
    expect(screen.getByTestId("cc-state-contacted")).toBeInTheDocument();
    expect(screen.getByTestId("cc-state-qualified")).toBeInTheDocument();
    expect(screen.getByText("20 leads")).toBeInTheDocument();
  });

  it("renders the empty state with no states", () => {
    render(<StateMachineCanvas states={[]} />);
    expect(screen.getByTestId("cc-state-empty")).toBeInTheDocument();
  });
});
