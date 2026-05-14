"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  approveQueueItemAction,
  rejectQueueItemAction,
} from "./actions";

/** D-600 — a brochure ref carried on a brochure_send queue row. */
export type QueueAttachment = {
  brochure_id: string;
  title: string;
  document_type: string;
};

export type QueueItemRow = {
  id: string;
  lead_id: string;
  lead_label: string;
  channel: "whatsapp" | "email" | "sms";
  draft_body: string;
  agent_kind: string;
  created_at: string;
  /** D-600 — brochure refs (empty for non-brochure drafts). */
  attachments: QueueAttachment[];
  /** D-600 — agent-level error, e.g. 'no_match'. Null on a clean draft. */
  error: string | null;
};

type DoneState =
  | { kind: "approved" }
  | { kind: "deferred"; channel: "email" | "sms" | "whatsapp" }
  | { kind: "rejected" };

export function QueueItem({ item }: { item: QueueItemRow }) {
  const [body, setBody] = useState(item.draft_body);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  const dirty = body.trim() !== item.draft_body.trim();

  function approve() {
    setErr(null);
    startTransition(async () => {
      const r = await approveQueueItemAction(item.id, dirty ? body : null);
      if (!r.ok) {
        setErr(r.message ?? r.error);
        return;
      }
      setDone(
        r.dispatch === "deferred"
          ? { kind: "deferred", channel: r.channel }
          : { kind: "approved" },
      );
    });
  }

  function reject() {
    if (reason.trim().length < 3) {
      setErr("Reason needs at least 3 characters.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const r = await rejectQueueItemAction(item.id, reason);
      if (!r.ok) {
        setErr(r.message ?? r.error);
        return;
      }
      setDone({ kind: "rejected" });
    });
  }

  if (done) {
    if (done.kind === "deferred") {
      return (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Approved — but not sent. Configure your {done.channel} integration
          to send this draft.{" "}
          <Link
            href={`/admin/integrations/${done.channel}`}
            className="font-medium underline"
          >
            Open {done.channel} integration settings
          </Link>
        </div>
      );
    }
    return (
      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
        {done.kind === "approved" ? "Approved." : "Rejected."}
      </div>
    );
  }

  return (
    <div className="rounded border border-neutral-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/leads/${item.lead_id}`}
            className="text-blue-700 hover:underline font-medium"
          >
            {item.lead_label}
          </Link>
          <span className="text-neutral-300">·</span>
          <span className="uppercase">{item.channel}</span>
          <span className="text-neutral-300">·</span>
          <span>{item.agent_kind}</span>
        </div>
        <span>{new Date(item.created_at).toLocaleString()}</span>
      </div>

      {item.error === "no_match" && (
        <p
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800"
          data-testid={`queue-error-${item.id}`}
        >
          No matching brochure found. Upload one at{" "}
          <Link href="/admin/brochures" className="font-medium underline">
            /admin/brochures
          </Link>{" "}
          or attach a document manually before sending.
        </p>
      )}

      {item.attachments.length > 0 && (
        <ul
          className="space-y-1"
          data-testid={`queue-attachments-${item.id}`}
        >
          {item.attachments.map((a) => (
            <li
              key={a.brochure_id}
              className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-800"
            >
              Attachment · {a.document_type.replace(/_/g, " ")}: {a.title}
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full rounded border border-neutral-300 p-2 text-sm font-mono"
      />
      {dirty && (
        <p className="text-xs text-amber-700">
          You&apos;ve edited the draft. Approving will save the edited copy.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={approve} disabled={pending} size="sm">
          {pending ? "..." : dirty ? "Edit + approve" : "Approve"}
        </Button>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reject reason..."
          className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reject}
          disabled={pending}
        >
          Reject
        </Button>
      </div>
      {err && <p className="text-xs text-rose-700">{err}</p>}
    </div>
  );
}
