// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PulseFeed } from "@/components/command-center/pulse-feed";

describe("PulseFeed", () => {
  it("renders the section header and tick rate", () => {
    render(<PulseFeed />);
    expect(screen.getByText(/Listeners parsing in real time/i)).toBeInTheDocument();
    expect(screen.getByText(/47 \/ sec/)).toBeInTheDocument();
  });

  it("renders all four mock listener entries", () => {
    render(<PulseFeed />);
    expect(screen.getByText("Listener · Inbound Call")).toBeInTheDocument();
    expect(screen.getByText("Listener · WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Listener · Site Visit Voice Note")).toBeInTheDocument();
    expect(screen.getByText("Listener · Email Reply")).toBeInTheDocument();
  });

  it("renders extracted signal pills on entries", () => {
    render(<PulseFeed />);
    expect(screen.getByText("Budget: ₹1.6Cr")).toBeInTheDocument();
    expect(screen.getByText("Intent: High")).toBeInTheDocument();
    expect(screen.getByText("Sentiment: Positive")).toBeInTheDocument();
    expect(screen.getByText("Objection: Parking")).toBeInTheDocument();
  });
});
