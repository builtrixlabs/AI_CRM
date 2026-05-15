"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * v6.2.1 — reusable agent-draft approval card.
 *
 * Lifted out of /admin/agents/queue/queue-item.tsx so the same UI renders in
 * two surfaces:
 *   1. /admin/agents/queue          — manager / org-admin rollup, can approve
 *                                     any draft in the org.
 *   2. /dashboard/leads/[id]        — sales-rep inline approval on their own
 *                                     leads (AI Drafts tab, D-617's home).
 *
 * The component is "dumb": it knows nothing about who is allowed to approve.
 * That decision is made by the caller (server-side, via canApproveQueueItem)
 * and surfaced through the `canApprove` prop. When false, the action buttons
 * render disabled with `disabledReason` as a tooltip.
 *
 * Server actions are injected as props so the same card can dispatch to
 * org-admin-gated or owner-scoped actions depending on context.
 */

/** D-600 — a brochure ref carried on a brochure_send queue row. */
export type DraftCardAttachment = {
  brochure_id: string;
  title: string;
  document_type: string;
};

export type DraftCardItem = {
  id: string;
  lead_id: string;
  lead_label: string;
  channel: "whatsapp" | "email" | "sms";
  draft_body: string;
  agent_kind: string;
  created_at: string;
  /** D-600 — brochure refs (empty for non-brochure drafts). */
  attachments: DraftCardAttachment[];
  /** D-600 — agent-level error, e.g. 'no_match'. Null on a clean draft. */
  error: string | null;
};

/** Wire-compatible with the admin actions (QueueActionResult) and the
 *  v6.2.1 inline actions (DraftActionResult). */
export type DraftCardActionResult =
  | { ok: true; dispatch?: "sent" }
  | { ok: true; dispatch: "deferred"; channel: "email" | "sms" | "whatsapp" }
  | { ok: false; error: string; message?: string };

export type DraftCardProps = {
  item: DraftCardItem;
  /** When false, action buttons render disabled (with tooltip if reason given). */
  canApprove: boolean;
  /** Approve / edit-and-approve. `editedBody` is null when the operator did
   *  not change the text. */
  onApprove: (queueId: string, editedBody: string | null) => Promise<DraftCardActionResult>;
  /** Reject with required reason (≥3 chars). */
  onReject: (queueId: string, reason: string) => Promise<DraftCardActionResult>;
  /** Tooltip shown on the disabled approve button. Defaults to a generic message. */
  disabledReason?: string;
};

type DoneState =
  | { kind: "approved" }
  | { kind: "deferred"; channel: "email" | "sms" | "whatsapp" }
  | { kind: "rejected" };

export function DraftCard({
  item,
  canApprove,
  onApprove,
  onReject,
  disabledReason,
}: DraftCardProps) {
  const [body, setBody] = useState(item.draft_body);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  const dirty = body.trim() !== item.draft_body.trim();
  const disabledTip =
    disabledReason ?? "Only the assigned rep (or a manager) can approve this draft.";

  function approve() {
    setErr(null);
    startTransition(async () => {
      const r = await onApprove(item.id, dirty ? body : null);
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
      const r = await onReject(item.id, reason);
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
    <div
      className="rounded border border-neutral-200 bg-white p-4 space-y-3"
      data-testid={`draft-card-${item.id}`}
    >
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
        disabled={!canApprove}
      />
      {dirty && canApprove && (
        <p className="text-xs text-amber-700">
          You&apos;ve edited the draft. Approving will save the edited copy.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={approve}
          disabled={pending || !canApprove}
          size="sm"
          title={!canApprove ? disabledTip : undefined}
          data-testid={`draft-approve-${item.id}`}
        >
          {pending ? "..." : dirty ? "Edit + approve" : "Approve"}
        </Button>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reject reason..."
          className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-xs"
          disabled={!canApprove}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reject}
          disabled={pending || !canApprove}
          title={!canApprove ? disabledTip : undefined}
          data-testid={`draft-reject-${item.id}`}
        >
          Reject
        </Button>
      </div>
      {!canApprove && (
        <p
          className="text-xs text-neutral-500"
          data-testid={`draft-disabled-${item.id}`}
        >
          {disabledTip}
        </p>
      )}
      {err && (
        <p
          className="text-xs text-rose-700"
          data-testid={`draft-error-${item.id}`}
        >
          {err}
        </p>
      )}
    </div>
  );
}
