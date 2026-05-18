// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TabStrip } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/tab-strip";
import type { CanvasTabCounts } from "@/lib/canvas/types";

function counts(over: Partial<CanvasTabCounts> = {}): CanvasTabCounts {
  return {
    updates: 0,
    ai_drafts: 0,
    chats: 0,
    calls: 0,
    emails: 0,
    comments: 0,
    appointments: 0,
    documents: 0,
    ...over,
  };
}

describe("<TabStrip>", () => {
  it("renders all 8 tabs", () => {
    render(
      <TabStrip
        active="updates"
        counts={counts()}
        onChange={() => undefined}
      />,
    );
    for (const id of [
      "updates",
      "ai_drafts",
      "chats",
      "calls",
      "emails",
      "comments",
      "appointments",
      "documents",
    ]) {
      expect(screen.getByTestId(`lead-canvas-tab-${id}`)).toBeDefined();
    }
  });

  it("hides the badge when count is zero", () => {
    render(
      <TabStrip
        active="updates"
        counts={counts()}
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByTestId("lead-canvas-tab-updates-badge")).toBeNull();
    expect(screen.queryByTestId("lead-canvas-tab-ai_drafts-badge")).toBeNull();
  });

  it("renders count badges for non-zero tabs", () => {
    render(
      <TabStrip
        active="updates"
        counts={counts({ updates: 8, ai_drafts: 2, chats: 3, calls: 1 })}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByTestId("lead-canvas-tab-updates-badge").textContent,
    ).toBe("8");
    expect(
      screen.getByTestId("lead-canvas-tab-ai_drafts-badge").textContent,
    ).toBe("2");
    expect(screen.getByTestId("lead-canvas-tab-chats-badge").textContent).toBe(
      "3",
    );
    expect(screen.getByTestId("lead-canvas-tab-calls-badge").textContent).toBe(
      "1",
    );
  });

  it("marks the active tab with aria-selected=true", () => {
    render(
      <TabStrip
        active="ai_drafts"
        counts={counts({ ai_drafts: 2 })}
        onChange={() => undefined}
      />,
    );
    expect(
      screen
        .getByTestId("lead-canvas-tab-ai_drafts")
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("lead-canvas-tab-updates")
        .getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("calls onChange with the clicked tab id", () => {
    const onChange = vi.fn();
    render(
      <TabStrip
        active="updates"
        counts={counts({ ai_drafts: 2 })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("lead-canvas-tab-ai_drafts"));
    expect(onChange).toHaveBeenCalledWith("ai_drafts");
  });

  it("ArrowRight on the active tab moves selection to the next tab", () => {
    const onChange = vi.fn();
    render(
      <TabStrip
        active="updates"
        counts={counts({ ai_drafts: 1 })}
        onChange={onChange}
      />,
    );
    const active = screen.getByTestId("lead-canvas-tab-updates");
    fireEvent.keyDown(active, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("ai_drafts");
  });

  it("ArrowLeft on the active tab wraps to the last tab", () => {
    const onChange = vi.fn();
    render(
      <TabStrip active="updates" counts={counts()} onChange={onChange} />,
    );
    const active = screen.getByTestId("lead-canvas-tab-updates");
    fireEvent.keyDown(active, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("documents");
  });

  it("Home jumps to the first tab and End jumps to the last", () => {
    const onChange = vi.fn();
    render(
      <TabStrip active="calls" counts={counts()} onChange={onChange} />,
    );
    const active = screen.getByTestId("lead-canvas-tab-calls");
    fireEvent.keyDown(active, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("documents");
    fireEvent.keyDown(active, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("updates");
  });

  it("roving tabindex: only the active tab is in the tab order", () => {
    render(
      <TabStrip active="ai_drafts" counts={counts()} onChange={() => undefined} />,
    );
    expect(
      screen.getByTestId("lead-canvas-tab-ai_drafts").getAttribute("tabindex"),
    ).toBe("0");
    expect(
      screen.getByTestId("lead-canvas-tab-updates").getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("ai_drafts badge gets the actionable (rose-600) class when count > 0", () => {
    render(
      <TabStrip
        active="updates"
        counts={counts({ ai_drafts: 3, chats: 4 })}
        onChange={() => undefined}
      />,
    );
    const aiDraftsBadge = screen.getByTestId(
      "lead-canvas-tab-ai_drafts-badge",
    );
    const chatsBadge = screen.getByTestId("lead-canvas-tab-chats-badge");
    expect(aiDraftsBadge.className).toMatch(/rose-600/);
    expect(chatsBadge.className).not.toMatch(/rose-600/);
  });
});
