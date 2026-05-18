"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
// IMPORTANT: import from the leaf module, NOT the @/lib/leads barrel.
// The barrel re-exports from ./api which imports getSupabaseAdmin —
// a server-only module with a top-level `throw` that fires on any
// client bundle hydration. (Every other client component in the repo
// follows this convention; this file is the only one that broke it.)
import { LEAD_STATES, type LeadState } from "@/lib/leads/types";
import { quickActionAction } from "../actions/quick-action";

/**
 * v6.2.1 — Quick Action modal. Three optional fields:
 *   - comment textarea
 *   - status select (limited to legal transitions from currentState)
 *   - follow-up datetime picker
 * Single Save button → atomic action. If any single field fails validation,
 * nothing writes.
 */

export type QuickActionModalProps = {
  leadId: string;
  currentState: string;
  open: boolean;
  onClose: () => void;
};

const TERMINAL: ReadonlySet<LeadState> = new Set([
  "lost",
  "on_hold",
  "junk",
]);

/** Mirror of the TS transition graph — keeps the modal client-renderable
 *  without an async import. Asserted-equivalent to TRANSITIONS in tests. */
const ALLOWED: Readonly<Record<string, readonly LeadState[]>> = {
  new: ["contacted", "qualified", "lost", "on_hold", "junk"],
  contacted: ["qualified", "lost", "on_hold", "junk"],
  qualified: ["lost", "on_hold", "junk"],
  lost: [],
  on_hold: [],
  junk: [],
};

export function QuickActionModal({
  leadId,
  currentState,
  open,
  onClose,
}: QuickActionModalProps) {
  const [comment, setComment] = useState("");
  const [targetState, setTargetState] = useState<LeadState | "">("");
  const [followUp, setFollowUp] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement | null>(null);

  // ESC to close + body scroll lock + auto-focus the comment field when open.
  // Skipped when closed so we don't leak listeners on every render.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Auto-focus the first input on open — gives keyboard users a sane entry.
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, pending, onClose]);

  if (!open) return null;

  const allowedTransitions = ALLOWED[currentState] ?? [];
  const isTerminalTarget = targetState !== "" && TERMINAL.has(targetState);

  function submit() {
    setError(null);
    const hasSomething =
      comment.trim().length > 0 || targetState !== "" || followUp !== "";
    if (!hasSomething) {
      setError("Fill at least one field before saving.");
      return;
    }
    if (followUp) {
      const t = Date.parse(followUp);
      if (!Number.isFinite(t) || t <= Date.now()) {
        setError("Follow-up date must be in the future.");
        return;
      }
    }
    if (isTerminalTarget && reason.trim().length === 0) {
      setError("Reason is required when moving to a terminal state.");
      return;
    }
    startTransition(async () => {
      const r = await quickActionAction(leadId, {
        comment: comment.trim() || undefined,
        target_state: (targetState as LeadState) || undefined,
        follow_up_on: followUp ? new Date(followUp).toISOString() : undefined,
        reason: reason.trim() || undefined,
      });
      if (!r.ok) {
        setError(`${r.error}${r.message ? `: ${r.message}` : ""}`);
        return;
      }
      // Reset + close
      setComment("");
      setTargetState("");
      setFollowUp("");
      setReason("");
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-action-title"
      data-testid="quick-action-modal"
      onClick={(e) => {
        // Backdrop click closes — only when the click landed on the backdrop
        // itself, not on the panel inside.
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
        data-testid="quick-action-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="quick-action-title"
            className="text-base font-semibold tracking-tight"
          >
            Quick action
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-700"
            data-testid="quick-action-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Comment (optional)
            </span>
            <textarea
              ref={firstFieldRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter submits — common modal shortcut.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={3}
              maxLength={4000}
              className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm"
              placeholder="Brief context, what happened on the call, etc."
              data-testid="quick-action-comment"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Move to status
            </span>
            <select
              value={targetState}
              onChange={(e) => setTargetState(e.target.value as LeadState | "")}
              className="mt-1 h-9 w-full rounded border border-neutral-300 px-2 text-sm"
              disabled={allowedTransitions.length === 0}
              data-testid="quick-action-status"
            >
              <option value="">— no change ({currentState}) —</option>
              {allowedTransitions.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            {allowedTransitions.length === 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                This lead is in a terminal state — no transitions available.
              </p>
            )}
          </label>

          {isTerminalTarget && (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Reason (required for {targetState})
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-neutral-300 px-2 text-sm"
                data-testid="quick-action-reason"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Follow-up reminder (optional)
            </span>
            <input
              type="datetime-local"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              className="mt-1 h-9 w-full rounded border border-neutral-300 px-2 text-sm"
              data-testid="quick-action-follow-up"
            />
          </label>
        </div>

        {error && (
          <p
            className="mt-3 text-xs text-rose-700"
            role="alert"
            data-testid="quick-action-error"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={pending}
            data-testid="quick-action-save"
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Re-export for symmetry with the rest of LEAD_STATES consumers. */
export { LEAD_STATES };
