// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLeadActivityStream } from "@/components/canvas/realtime";
import type { CanvasActivity } from "@/lib/canvas/types";

type Handler = (payload: { new: unknown }) => void;

function buildMockClient() {
  const handlers: Handler[] = [];
  const unsubscribe = vi.fn();
  const channel = {
    on: vi.fn((_evt: string, _filter: unknown, handler: Handler) => {
      handlers.push(handler);
      return channel;
    }),
    subscribe: vi.fn(() => ({ unsubscribe })),
  };
  const client = {
    channel: vi.fn(() => channel),
  };
  return { client, channel, handlers, unsubscribe };
}

const SEED: CanvasActivity[] = [
  {
    id: "seed-1",
    organization_id: "org-A",
    workspace_id: "ws-A",
    label: "Seed",
    data: { kind: "init" },
    created_at: "2026-05-01T10:00:00Z",
    created_by: "u",
    created_via: "manual",
    ai_confidence: null,
    agent_tier: null,
  },
];

const matchingActivity: CanvasActivity = {
  id: "new-1",
  organization_id: "org-A",
  workspace_id: "ws-A",
  label: "New",
  data: { kind: "wa", text: "hi" },
  created_at: "2026-05-04T09:00:00Z",
  created_by: "u",
  created_via: "whatsapp",
  ai_confidence: null,
  agent_tier: null,
};

describe("useLeadActivityStream", () => {
  it("returns the initial array when paused (demo mode)", () => {
    const { client } = buildMockClient();
    const { result } = renderHook(() =>
      useLeadActivityStream({
        lead_id: "lead-1",
        initial: SEED,
        currentOrgId: "org-A",
        paused: true,
        client: client as never,
      }),
    );
    expect(result.current).toEqual(SEED);
    expect(client.channel).not.toHaveBeenCalled();
  });

  it("subscribes on mount and unsubscribes on unmount", () => {
    const { client, channel, unsubscribe } = buildMockClient();
    const { unmount } = renderHook(() =>
      useLeadActivityStream({
        lead_id: "lead-1",
        initial: SEED,
        currentOrgId: "org-A",
        client: client as never,
      }),
    );
    expect(client.channel).toHaveBeenCalledWith("canvas:lead:lead-1");
    expect(channel.subscribe).toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("prepends a matching event to the activity list", () => {
    const { client, handlers } = buildMockClient();
    const { result } = renderHook(() =>
      useLeadActivityStream({
        lead_id: "lead-1",
        initial: SEED,
        currentOrgId: "org-A",
        client: client as never,
      }),
    );
    act(() => {
      handlers[0]!({ new: matchingActivity });
    });
    expect(result.current).toHaveLength(2);
    expect(result.current[0]!.id).toBe("new-1");
  });

  it("drops cross-org events (defense-in-depth)", () => {
    const { client, handlers } = buildMockClient();
    const { result } = renderHook(() =>
      useLeadActivityStream({
        lead_id: "lead-1",
        initial: SEED,
        currentOrgId: "org-A",
        client: client as never,
      }),
    );
    act(() => {
      handlers[0]!({ new: { ...matchingActivity, organization_id: "org-OTHER" } });
    });
    expect(result.current).toEqual(SEED);
  });

  it("drops cross-workspace events when currentWorkspaceId is given", () => {
    const { client, handlers } = buildMockClient();
    const { result } = renderHook(() =>
      useLeadActivityStream({
        lead_id: "lead-1",
        initial: SEED,
        currentOrgId: "org-A",
        currentWorkspaceId: "ws-A",
        client: client as never,
      }),
    );
    act(() => {
      handlers[0]!({ new: { ...matchingActivity, workspace_id: "ws-OTHER" } });
    });
    expect(result.current).toEqual(SEED);
  });

  it("ignores malformed payloads", () => {
    const { client, handlers } = buildMockClient();
    const { result } = renderHook(() =>
      useLeadActivityStream({
        lead_id: "lead-1",
        initial: SEED,
        currentOrgId: "org-A",
        client: client as never,
      }),
    );
    act(() => {
      handlers[0]!({ new: { incomplete: true } });
    });
    expect(result.current).toEqual(SEED);
  });

  it("deduplicates by id when the same event arrives twice", () => {
    const { client, handlers } = buildMockClient();
    const { result } = renderHook(() =>
      useLeadActivityStream({
        lead_id: "lead-1",
        initial: SEED,
        currentOrgId: "org-A",
        client: client as never,
      }),
    );
    act(() => {
      handlers[0]!({ new: matchingActivity });
      handlers[0]!({ new: matchingActivity });
    });
    expect(result.current).toHaveLength(2);
  });
});
