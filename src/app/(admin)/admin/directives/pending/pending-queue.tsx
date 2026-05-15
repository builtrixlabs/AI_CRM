"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { PendingWorkflowRow } from "@/lib/doe/authoring";
import { approveWorkflowAction, rejectWorkflowAction } from "./actions";

const MIN_REASON = 10;

export function PendingQueueItem({
  workflow,
}: {
  workflow: PendingWorkflowRow;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  function approve() {
    setErr(null);
    startTransition(async () => {
      const r = await approveWorkflowAction(workflow.id);
      if (!r.ok) {
        setErr(r.message ?? r.error);
        return;
      }
      setDone("approved");
    });
  }

  function reject() {
    if (reason.trim().length < MIN_REASON) {
      setErr(`Rejection reason needs at least ${MIN_REASON} characters.`);
      return;
    }
    setErr(null);
    startTransition(async () => {
      const r = await rejectWorkflowAction(workflow.id, reason);
      if (!r.ok) {
        setErr(r.message ?? r.error);
        return;
      }
      setDone("rejected");
    });
  }

  if (done) {
    return (
      <div
        className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600"
        data-testid={`pending-workflow-${workflow.id}`}
      >
        {workflow.code} —{" "}
        {done === "approved"
          ? "Approved — now live."
          : "Rejected — archived."}
      </div>
    );
  }

  return (
    <div
      className="rounded border border-neutral-200 bg-white p-4 space-y-3"
      data-testid={`pending-workflow-${workflow.id}`}
    >
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span className="font-mono">{workflow.code}</span>
          <span className="text-neutral-300">·</span>
          <span className="font-medium text-neutral-800">
            {workflow.display_name}
          </span>
        </div>
        <span>{workflow.tier}</span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
        <span className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono">
          trigger: {workflow.trigger_kind}
        </span>
        <span className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono">
          action: {workflow.action_kind}
        </span>
        {workflow.submitted_at && (
          <span>
            submitted {new Date(workflow.submitted_at).toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={approve} disabled={pending}>
          {pending ? "..." : "Approve"}
        </Button>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reject reason (min 10 chars)..."
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
      {err && (
        <p
          className="text-xs text-rose-700"
          data-testid={`pending-error-${workflow.id}`}
        >
          {err}
        </p>
      )}
    </div>
  );
}
