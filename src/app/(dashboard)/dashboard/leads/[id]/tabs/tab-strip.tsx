"use client";

import type { CanvasTabCounts } from "@/lib/canvas/types";

/**
 * v6.2.1 — the row of tabs at the top of the lead canvas right pane.
 *
 * Each tab shows a count badge (zero → no badge rendered, matches the spec
 * mock). The AI Drafts badge is the only one that gets a red bubble — it's
 * the actionable surface; the others are informational.
 */

export type TabId =
  | "updates"
  | "ai_drafts"
  | "chats"
  | "calls"
  | "emails"
  | "comments"
  | "appointments"
  | "documents";

export type TabDef = {
  id: TabId;
  label: string;
  count: number;
  /** When true, the count badge renders in red instead of neutral. */
  actionable?: boolean;
};

export type TabStripProps = {
  active: TabId;
  counts: CanvasTabCounts;
  onChange: (id: TabId) => void;
};

const TABS: ReadonlyArray<Omit<TabDef, "count">> = [
  { id: "updates", label: "Updates" },
  { id: "ai_drafts", label: "AI Drafts", actionable: true },
  { id: "chats", label: "Chats" },
  { id: "calls", label: "Calls" },
  { id: "emails", label: "Emails" },
  { id: "comments", label: "Comments" },
  { id: "appointments", label: "Appointments" },
  { id: "documents", label: "Documents" },
];

export function TabStrip({ active, counts, onChange }: TabStripProps) {
  return (
    <div
      role="tablist"
      aria-label="Lead canvas tabs"
      className="flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-1"
      data-testid="lead-canvas-tab-strip"
    >
      {TABS.map((t) => {
        const count = counts[t.id];
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            data-testid={`lead-canvas-tab-${t.id}`}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition " +
              (isActive
                ? "bg-neutral-900 text-white"
                : "text-neutral-700 hover:bg-neutral-100")
            }
          >
            <span>{t.label}</span>
            {count > 0 && (
              <span
                data-testid={`lead-canvas-tab-${t.id}-badge`}
                className={
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold " +
                  (t.actionable
                    ? "bg-rose-600 text-white"
                    : isActive
                      ? "bg-white/20 text-white"
                      : "bg-neutral-200 text-neutral-700")
                }
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
