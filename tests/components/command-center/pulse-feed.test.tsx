// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PulseFeed } from "@/components/command-center/pulse-feed";

// Minimal fake Supabase client — channel().on().subscribe() with an
// unsubscribe handle. PulseFeed accepts an injected client for tests.
const fakeClient = {
  channel: () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = () => ({ unsubscribe: () => {} });
    return ch;
  },
};

const NOW = new Date().toISOString();

describe("<PulseFeed> — D-605 real data", () => {
  it("renders the seeded activities", () => {
    render(
      <PulseFeed
        orgId="org-1"
        client={fakeClient as never}
        initialActivities={[
          {
            id: "a1",
            label: "Inbound call · Asha",
            created_via: "call_audit",
            created_at: NOW,
            channel: "voice",
          },
          {
            id: "a2",
            label: "WhatsApp reply",
            created_via: "whatsapp",
            created_at: NOW,
            channel: "whatsapp",
          },
        ]}
      />,
    );
    expect(screen.getAllByTestId("cc-pulse-row")).toHaveLength(2);
    expect(screen.getByText("Inbound call · Asha")).toBeInTheDocument();
  });

  it("renders the empty state with no activities", () => {
    render(
      <PulseFeed
        orgId="org-1"
        client={fakeClient as never}
        initialActivities={[]}
      />,
    );
    expect(screen.getByTestId("cc-pulse-empty")).toBeInTheDocument();
  });
});
