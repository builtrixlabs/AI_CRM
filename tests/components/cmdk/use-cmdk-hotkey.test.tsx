// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCmdkHotkey } from "@/components/cmdk/use-cmdk-hotkey";

function dispatchKey(key: string, options: KeyboardEventInit = {}, target?: Element) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  Object.defineProperty(event, "target", {
    get: () => target ?? document.body,
  });
  document.dispatchEvent(event);
  return event;
}

describe("useCmdkHotkey", () => {
  it("fires onOpen for Cmd+K on macOS", () => {
    const onOpen = vi.fn();
    renderHook(() => useCmdkHotkey(onOpen));
    const ev = dispatchKey("k", { metaKey: true });
    expect(onOpen).toHaveBeenCalledOnce();
    expect(ev.defaultPrevented).toBe(true);
  });

  it("fires onOpen for Ctrl+K on Linux/Windows", () => {
    const onOpen = vi.fn();
    renderHook(() => useCmdkHotkey(onOpen));
    dispatchKey("k", { ctrlKey: true });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("ignores plain k", () => {
    const onOpen = vi.fn();
    renderHook(() => useCmdkHotkey(onOpen));
    dispatchKey("k");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onOpen = vi.fn();
    renderHook(() => useCmdkHotkey(onOpen));
    dispatchKey("j", { metaKey: true });
    dispatchKey("a", { ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores Cmd+K when an INPUT has focus", () => {
    const onOpen = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useCmdkHotkey(onOpen));
    dispatchKey("k", { metaKey: true }, input);
    expect(onOpen).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores Cmd+K when a TEXTAREA has focus", () => {
    const onOpen = vi.fn();
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    renderHook(() => useCmdkHotkey(onOpen));
    dispatchKey("k", { metaKey: true }, ta);
    expect(onOpen).not.toHaveBeenCalled();
    ta.remove();
  });

  it("ignores Cmd+K when a contentEditable div has focus", () => {
    const onOpen = vi.fn();
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.appendChild(div);
    div.focus();
    renderHook(() => useCmdkHotkey(onOpen));
    dispatchKey("k", { metaKey: true }, div);
    expect(onOpen).not.toHaveBeenCalled();
    div.remove();
  });

  it("accepts uppercase K too", () => {
    const onOpen = vi.fn();
    renderHook(() => useCmdkHotkey(onOpen));
    dispatchKey("K", { metaKey: true });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("removes the listener on unmount", () => {
    const onOpen = vi.fn();
    const { unmount } = renderHook(() => useCmdkHotkey(onOpen));
    unmount();
    dispatchKey("k", { metaKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
