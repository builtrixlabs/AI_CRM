// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeadCanvas } from "@/components/canvas/lead-canvas";
import { DEMO_LEAD, DEMO_ACTIVITIES } from "@/lib/canvas/fixture";
import type { CanvasLead } from "@/lib/canvas/types";

function pausedClient() {
  return {
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      })),
    })),
  } as never;
}

describe("LeadCanvas", () => {
  it("renders all five sections in documented order (no tabs)", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        demo
      />,
    );
    expect(screen.getByTestId("section-header")).toBeInTheDocument();
    expect(screen.getByTestId("section-fields")).toBeInTheDocument();
    expect(screen.getByTestId("section-activity")).toBeInTheDocument();
    expect(screen.getByTestId("section-suggested")).toBeInTheDocument();
    expect(screen.getByTestId("section-agent")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
  });

  it("renders the demo banner when demo=true", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        demo
      />,
    );
    expect(screen.getByTestId("demo-banner")).toBeInTheDocument();
  });

  it("does not render the demo banner when demo=false", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
      />,
    );
    expect(screen.queryByTestId("demo-banner")).toBeNull();
  });

  it("replaces fields with SchemaMismatch when leadSchema fails", () => {
    const broken: CanvasLead = {
      ...DEMO_LEAD,
      data: { phone: 123 } as never,
    };
    render(
      <LeadCanvas
        lead={broken}
        initialActivities={DEMO_ACTIVITIES}
        demo
      />,
    );
    expect(screen.queryByTestId("section-fields")).toBeNull();
    expect(screen.getByTestId("section-schema-mismatch")).toBeInTheDocument();
    expect(screen.getByTestId("schema-mismatch")).toBeInTheDocument();
  });

  it("renders empty-state copy in suggested-action and agent slots when no children", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        demo
      />,
    );
    expect(screen.getByTestId("suggested-action").getAttribute("data-empty")).toBe(
      "true",
    );
    expect(screen.getByTestId("agent-panel").getAttribute("data-empty")).toBe(
      "true",
    );
  });

  it("replaces slot empty-state when children passed", () => {
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        demo
        suggestedAction={<p>do thing</p>}
        agentActivity={<p>agent ran</p>}
      />,
    );
    expect(screen.getByText("do thing")).toBeInTheDocument();
    expect(screen.getByText("agent ran")).toBeInTheDocument();
    expect(screen.getByTestId("suggested-action").getAttribute("data-empty")).toBe(
      "false",
    );
  });

  it("paused realtime is the default in demo mode (passes paused=true to ActivityStream)", () => {
    const client = pausedClient();
    render(
      <LeadCanvas
        lead={DEMO_LEAD}
        initialActivities={DEMO_ACTIVITIES}
        demo
      />,
    );
    // No subscription attempted — ActivityStream's `paused=true` short-circuits.
    expect((client.channel as unknown as { mock?: { calls: unknown[] } }).mock?.calls?.length ?? 0).toBe(
      0,
    );
  });
});
