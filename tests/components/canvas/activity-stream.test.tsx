// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityStream } from "@/components/canvas/activity-stream";
import { DEMO_ACTIVITIES } from "@/lib/canvas/fixture";

function pausedClient() {
  return {
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      })),
    })),
  } as never;
}

describe("ActivityStream", () => {
  it("renders the section heading", () => {
    render(
      <ActivityStream
        lead_id="lead-1"
        initial={DEMO_ACTIVITIES}
        currentOrgId={DEMO_ACTIVITIES[0]!.organization_id}
        currentWorkspaceId={DEMO_ACTIVITIES[0]!.workspace_id}
        paused
        client={pausedClient()}
      />,
    );
    expect(screen.getByText(/Activity Stream/i)).toBeInTheDocument();
  });

  it("renders one row per fixture activity", () => {
    render(
      <ActivityStream
        lead_id="lead-1"
        initial={DEMO_ACTIVITIES}
        currentOrgId={DEMO_ACTIVITIES[0]!.organization_id}
        paused
        client={pausedClient()}
      />,
    );
    expect(screen.getAllByTestId("activity-row")).toHaveLength(
      DEMO_ACTIVITIES.length,
    );
  });

  it("renders the empty-state copy when initial is empty", () => {
    render(
      <ActivityStream
        lead_id="lead-1"
        initial={[]}
        currentOrgId="org-A"
        paused
        client={pausedClient()}
      />,
    );
    expect(screen.getByTestId("activity-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-list")).toBeNull();
  });
});
