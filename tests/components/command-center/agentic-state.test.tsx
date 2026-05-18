// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgenticState } from "@/components/command-center/agentic-state";

describe("<AgenticState> — D-605 agent_approval_queue summary", () => {
  it("renders the four queue counts with labels", () => {
    render(
      <AgenticState
        agentic={{ pending: 5, approved: 2, sent_today: 9, rejected: 1 }}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(screen.getByText("Sent today")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });
});
