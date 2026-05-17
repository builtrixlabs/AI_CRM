"use client";

import type { CanvasActivity } from "@/lib/canvas/types";

/**
 * v6.2.1 — Emails tab: outbound `comms_sent` rows on the email channel.
 * Inbound email isn't ingested in v6 yet; when it lands, the same shape
 * (channel=email, direction=inbound) will render alongside outbound here.
 */
export type EmailsTabProps = {
  activities: CanvasActivity[];
};

function isEmailRow(a: CanvasActivity): boolean {
  const d = a.data as Record<string, unknown> | undefined;
  if (!d) return false;
  return d.kind === "comms_sent" && d.channel === "email";
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function EmailsTab({ activities }: EmailsTabProps) {
  const rows = activities.filter(isEmailRow);
  if (rows.length === 0) {
    return (
      <div
        className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
        data-testid="emails-tab-empty"
      >
        No emails sent yet. Email drafts approved on the AI Drafts tab will
        appear here.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="emails-tab">
      {rows.map((a) => (
        <li
          key={a.id}
          data-testid={`email-row-${a.id}`}
          className="rounded border border-neutral-200 bg-white p-3"
        >
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span className="font-semibold uppercase">email</span>
            <time dateTime={a.created_at}>{fmt(a.created_at)}</time>
          </div>
          <p className="mt-1 text-sm font-medium text-neutral-900">{a.label}</p>
        </li>
      ))}
    </ul>
  );
}
