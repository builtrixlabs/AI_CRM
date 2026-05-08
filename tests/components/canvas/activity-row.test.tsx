// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityRow } from "@/components/canvas/activity-row";
import type { CanvasActivity } from "@/lib/canvas/types";

const baseHuman: CanvasActivity = {
  id: "act-h",
  organization_id: "org-1",
  workspace_id: "ws-1",
  label: "Call from Rakesh Kumar",
  data: { kind: "call_audited", summary: "Discussed financing." },
  created_at: "2026-05-04T09:42:00Z",
  created_by: "user-1",
  created_via: "call_audit",
  ai_confidence: null,
  agent_tier: null,
};

const baseAgent: CanvasActivity = {
  ...baseHuman,
  id: "act-ai",
  label: "Lead enriched",
  data: { kind: "ai_extraction", summary: "Set initial intent score." },
  created_via: "ai_extraction",
  ai_confidence: 0.92,
  agent_tier: "T1",
};

describe("ActivityRow", () => {
  it("renders human row without tier badge or audit link", () => {
    render(<ActivityRow activity={baseHuman} />);
    expect(screen.getByTestId("activity-row").getAttribute("data-actor")).toBe(
      "human",
    );
    expect(screen.queryByTestId("tier-badge")).toBeNull();
  });

  it("renders AI row with tier badge + audit link", () => {
    render(<ActivityRow activity={baseAgent} />);
    expect(screen.getByTestId("activity-row").getAttribute("data-actor")).toBe(
      "agent",
    );
    expect(screen.getByTestId("tier-badge").textContent).toBe("T1");
    expect(screen.getByText("audit").getAttribute("href")).toBe(
      "/admin/audit?record_id=act-ai",
    );
  });

  it("renders the label and summary text", () => {
    render(<ActivityRow activity={baseHuman} />);
    expect(screen.getByText("Call from Rakesh Kumar")).toBeInTheDocument();
    expect(screen.getByText("Discussed financing.")).toBeInTheDocument();
  });

  it("falls back to the data.text field when summary is absent", () => {
    const inboundWA: CanvasActivity = {
      ...baseHuman,
      id: "act-wa",
      data: { kind: "whatsapp_inbound", text: "Hi, what's the floor plan?" },
    };
    render(<ActivityRow activity={inboundWA} />);
    expect(screen.getByText("Hi, what's the floor plan?")).toBeInTheDocument();
  });

  it("renders without a body paragraph when no summary or text", () => {
    const sparse: CanvasActivity = { ...baseHuman, data: { kind: "x" } };
    render(<ActivityRow activity={sparse} />);
    expect(screen.queryByText("Discussed financing.")).toBeNull();
  });
});
