// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgenticState } from "@/components/command-center/agentic-state";

describe("AgenticState", () => {
  it("renders running orchestrations and their progress percentages", () => {
    render(<AgenticState />);
    expect(screen.getByText("Drafting WhatsApp follow-ups")).toBeInTheDocument();
    expect(screen.getByText("Voice callbacks queued")).toBeInTheDocument();
    expect(screen.getByText(/Re-scoring 4,212 stale leads/i)).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("renders the footer roll-up stats", () => {
    render(<AgenticState />);
    expect(screen.getByText("104,238")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("$2.1M")).toBeInTheDocument();
  });
});
