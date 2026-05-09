"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { replyAction, setStatusAction } from "./actions";
import type { TicketStatus } from "@/lib/platform/tickets";

const STATUSES: TicketStatus[] = ["open", "responded", "closed"];

export function ReplyForm({
  ticket_id,
  current_status,
}: {
  ticket_id: string;
  current_status: TicketStatus;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await replyAction(ticket_id, body);
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      setBody("");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <Textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Reply to the customer…"
        disabled={pending}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          Status will flip to <code className="font-mono">responded</code> if
          currently <code className="font-mono">{current_status}</code> and
          <code className="font-mono"> open</code>. Outbound email lands V3 —
          for now reply persists on the thread.
        </span>
        <Button
          onClick={submit}
          disabled={pending || body.trim().length < 2}
        >
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function StatusControl({
  ticket_id,
  current_status,
}: {
  ticket_id: string;
  current_status: TicketStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TicketStatus>(current_status);

  const apply = () =>
    start(async () => {
      setError(null);
      const r = await setStatusAction(ticket_id, status);
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as TicketStatus)}
        className="rounded-md border bg-white px-3 py-1.5 text-sm"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        onClick={apply}
        disabled={pending || status === current_status}
      >
        {pending ? "Saving…" : "Apply"}
      </Button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
