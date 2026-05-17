"use client";

import type { CanvasActivity } from "@/lib/canvas/types";

/**
 * v6.2.1 — Chats tab: WhatsApp + SMS conversation rows.
 *
 * Reads from the existing activities stream and filters to
 * `data.kind === 'comms_sent'` with channel ∈ {whatsapp, sms}. The full
 * WhatsApp Business send/receive pipeline is provider-side; this tab
 * surfaces what dispatchApprovedDraft (D-603) writes to the activity log.
 */
export type ChatsTabProps = {
  activities: CanvasActivity[];
};

function isChatRow(a: CanvasActivity): boolean {
  const d = a.data as Record<string, unknown> | undefined;
  if (!d) return false;
  if (d.kind !== "comms_sent") return false;
  return d.channel === "whatsapp" || d.channel === "sms";
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ChatsTab({ activities }: ChatsTabProps) {
  const rows = activities.filter(isChatRow);
  if (rows.length === 0) {
    return (
      <div
        className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
        data-testid="chats-tab-empty"
      >
        No chat messages yet. WhatsApp / SMS drafts that get approved on
        the AI Drafts tab will appear here once dispatched.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="chats-tab">
      {rows.map((a) => {
        const d = a.data as Record<string, unknown>;
        const channel = (d.channel as string) ?? "whatsapp";
        return (
          <li
            key={a.id}
            data-testid={`chat-row-${a.id}`}
            data-channel={channel}
            className="rounded border border-neutral-200 bg-white p-3"
          >
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span className="font-semibold uppercase">{channel}</span>
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
