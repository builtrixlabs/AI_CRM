"use client";
import { useEffect } from "react";

/**
 * Returns true when the keyboard event originated inside an editable
 * element where Cmd/Ctrl+K should remain a passthrough (no palette).
 */
function isInsideEditable(e: KeyboardEvent): boolean {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // Some test environments (jsdom) don't propagate `isContentEditable`
  // from the attribute, so check both the property and the attribute.
  if (target.isContentEditable) return true;
  const attr = target.getAttribute("contenteditable");
  if (attr === "" || attr === "true" || attr === "plaintext-only") return true;
  return false;
}

/**
 * Listens for Cmd+K (macOS) / Ctrl+K (Linux/Windows) and invokes
 * `onOpen`. Suppressed when an editable element has focus so editing
 * UX (find-in-input, etc.) is not hijacked. Calls preventDefault when
 * the palette opens (overrides the browser's default address-bar focus).
 */
export function useCmdkHotkey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "k" && e.key !== "K") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isInsideEditable(e)) return;
      e.preventDefault();
      onOpen();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpen]);
}
