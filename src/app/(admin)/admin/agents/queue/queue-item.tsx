"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  approveQueueItemAction,
  rejectQueueItemAction,
} from "./actions";

export type QueueItemRow = {
  id: string;
  lead_id: string;
  lead_label: string;
  channel: "whatsapp" | "email";
  draft_body: string;
  agent_kind: string;
  created_at: string;
};

export function QueueItem({ item }: { item: QueueItemRow }) {
  const [body, setBody] = useState(item.draft_body);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const dirty = body.trim() !== item.draft_body.trim();

  function approve() {
    setErr(null);
    startTransition(async () => {
      const r = await approveQueueItemAction(item.id, dirty ? body : null);
      if (!r.ok) {
        setErr(r.message ?? r.error);
        return;
      }
      setDone("approved");
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
      setDone("rejected");
    });
  }

  if (done) {
    return (
      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
        {done === "approved" ? "Approved." : "Rejected."}
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
