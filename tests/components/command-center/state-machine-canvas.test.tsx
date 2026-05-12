// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateMachineCanvas } from "@/components/command-center/state-machine-canvas";

describe("StateMachineCanvas", () => {
  it("renders the canvas header with default title and subtitle", () => {
    render(<StateMachineCanvas />);
    expect(
      screen.getByText(/State machine · Lead 88421 · Rohit Menon/i),
    ).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("4 / 5 nodes")).toBeInTheDocument();
  });

  it("renders all five default workflow nodes in order", () => {
    render(<StateMachineCanvas />);
    expect(screen.getByText("Lead Ingested")).toBeInTheDocument();
    expect(screen.getByText("Sentiment Scored")).toBeInTheDocument();
    expect(screen.getByText("Intent Classified")).toBeInTheDocument();
    expect(screen.getByText("Drafted WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Auto-Sent")).toBeInTheDocument();
  });

  it("renders node indices 01 through 05", () => {
    render(<StateMachineCanvas />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
    expect(screen.getByText("05")).toBeInTheDocument();
  });

  it("accepts an overridden title and subtitle", () => {
    render(<StateMachineCanvas title="Custom · Lead 1" subtitle="2 / 3 nodes" />);
    expect(screen.getByText("Custom · Lead 1")).toBeInTheDocument();
    expect(screen.getByText("2 / 3 nodes")).toBeInTheDocument();
  });
});
