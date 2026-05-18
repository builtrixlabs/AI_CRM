"use client";

import type { CanvasActivity } from "@/lib/canvas/types";

/**
 * v6.2.1 — Updates tab: the chronological activity stream for a lead.
 * Mirrors the legacy canvas's <ActivityStream> behavior but rendered inside
 * the split-pane right column. Server-side fetches feed `activities`; the
 * realtime hook from the legacy canvas continues to apply when the v1
 * canvas is selected.
 */
export type UpdatesTabProps = {
  activities: CanvasActivity[];
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function UpdatesTab({ activities }: UpdatesTabProps) {
  if (activities.length === 0) {
    return (
      <div
        className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
        data-testid="updates-tab-empty"
      >
        No activity yet on this lead.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="updates-tab">
      {activities.map((a) => {
        const isAI = a.agent_tier !== null;
        const summary =
          typeof a.data?.summary === "string"
            ? (a.data.summary as string)
            : typeof a.data?.text === "string"
              ? (a.data.text as string)
              : null;
        return (
          <li
            key={a.id}
            data-testid={`updates-row-${a.id}`}
            data-actor={isAI ? "agent" : "human"}
            className="flex flex-col gap-1 border-b border-neutral-200 py-3 last:border-b-0"
          >
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <time dateTime={a.created_at}>{fmt(a.created_at)}</time>
              {isAI && (
                <span className="rounded bg-violet-100 px-1.5 text-[10px] font-semibold uppercase text-violet-800">
                  AI · {a.agent_tier}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-neutral-900">{a.label}</p>
            {summary && <p className="text-sm text-neutral-600">{summary}</p>}
          </li>
        );
      })}
    </ul>
  );
}
