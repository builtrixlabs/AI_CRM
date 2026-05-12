// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommandCenterTopbar } from "@/components/shell/command-center-topbar";

describe("CommandCenterTopbar", () => {
  it("renders the live indicator and operator status", () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/12 agents online/i)).toBeInTheDocument();
  });

  it("renders the workspace switcher", () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    expect(screen.getByText("Casagrand · Chennai South")).toBeInTheDocument();
  });

  it("renders user initials in the avatar chip", () => {
    render(<CommandCenterTopbar displayName="Aravind Ravi" />);
    expect(screen.getByLabelText("Profile and settings")).toHaveTextContent("AR");
  });

  it("falls back to placeholder initials when displayName is null", () => {
    render(<CommandCenterTopbar displayName={null} />);
    expect(screen.getByLabelText("Profile and settings")).toHaveTextContent("··");
  });
});
