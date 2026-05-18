"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowUp, Mic } from "lucide-react";

const SAMPLE_INTENTS = [
  "Reassign cold OMR leads",
  "Follow up with Nanganallur leads from yesterday's site visits",
  "Summarize Vikram Iyer's last 3 calls",
  "Draft WhatsApp to Casagrand ECR shortlist",
];

export function CommandBuiltrixBar() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SAMPLE_INTENTS.length), 4500);
    return () => clearInterval(t);
  }, []);

  function openCommandPalette() {
    const e = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(e);
  }

  return (
    <div className="sticky bottom-0 z-30 px-6 pb-5 pt-2 pointer-events-none">
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Open Command Builtrix"
        className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-3 rounded-full border border-white/[0.06] bg-[#0B1024]/85 px-4 py-2.5 text-left text-sm shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur transition-colors hover:border-[var(--cc-violet-500)]/40"
      >
        <span className="cc-sigil-violet flex h-7 w-7 items-center justify-center rounded-full">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="text-muted-foreground truncate">
          Command Builtrix:
          <span className="ml-2 font-medium text-foreground/90">
            &quot;{SAMPLE_INTENTS[idx]}&quot;
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <kbd className="rounded border border-white/[0.06] px-1.5 py-0.5 font-mono">⌘ K</kbd>
          <Mic className="h-3.5 w-3.5" />
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: "var(--cc-violet-500)", color: "#07091A" }}
          >
            <ArrowUp className="h-3 w-3" />
          </span>
        </span>
      </button>
    </div>
  );
}
