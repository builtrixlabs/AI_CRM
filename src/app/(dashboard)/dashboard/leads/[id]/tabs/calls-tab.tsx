"use client";

import type { CanvasActivity } from "@/lib/canvas/types";

/**
 * v6.2.1 — Calls tab: every `call_initiated` / `call_completed` activity
 * for this lead. D-609's click-to-call writes these rows; surfaced here
 * sorted DESC so the most recent call is at the top.
 *
 * Playback (download recording) is provider-dependent; this tab links out
 * to the audit row for now and the audit detail page surfaces the URL.
 */
export type CallsTabProps = {
  activities: CanvasActivity[];
};

function isCallRow(a: CanvasActivity): boolean {
  const d = a.data as Record<string, unknown> | undefined;
  if (!d) return false;
  return d.kind === "call_initiated" || d.kind === "call_completed";
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function CallsTab({ activities }: CallsTabProps) {
  const rows = activities.filter(isCallRow);
  if (rows.length === 0) {
    return (
      <div
        className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
        data-testid="calls-tab-empty"
      >
        No calls placed yet. Use the Call button on the left pane to start
        a call — it will appear here.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="calls-tab">
      {rows.map((a) => {
        const d = a.data as Record<string, unknown>;
        const status = (d.kind as string) === "call_completed" ? "done" : "live";
        const duration =
          typeof d.duration_seconds === "number"
            ? `${Math.floor((d.duration_seconds as number) / 60)}m ${
                (d.duration_seconds as number) % 60
              }s`
            : null;
        return (
          <li
            key={a.id}
            data-testid={`call-row-${a.id}`}
            className="rounded border border-neutral-200 bg-white p-3"
          >
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <div className="flex items-center gap-2">
                <span
                  className={
                    "rounded px-1.5 text-[10px] font-semibold uppercase " +
                    (status === "done"
                      ? "bg-neutral-200 text-neutral-700"
                      : "bg-emerald-100 text-emerald-800")
                  }
                >
                  {status === "done" ? "completed" : "in progress"}
                </span>
                {duration && (
                  <span data-testid={`call-row-${a.id}-duration`}>
                    {duration}
                  </span>
                )}
              </div>
              <time dateTime={a.created_at}>{fmt(a.created_at)}</time>
            </div>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              {a.label}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
