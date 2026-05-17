"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { CanvasComment } from "@/lib/canvas/types";
import { addCommentAction } from "../actions/add-comment";

/**
 * v6.2.1 — Comments tab: internal team note thread for a lead.
 *
 * Reads: server-rendered `comments` from getLeadCanvasV2.
 * Writes: addCommentAction (gated on notes:create — every operational
 *   role baseline has it).
 *
 * The compose form sits at the top so a rep adding context after a call
 * doesn't have to scroll. After a successful add, the action revalidates
 * the lead page and the new row server-renders into the list.
 */

export type CommentsTabProps = {
  leadId: string;
  comments: CanvasComment[];
  /** When false, render the compose form disabled with a tooltip. */
  canComment: boolean;
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function CommentsTab({ leadId, comments, canComment }: CommentsTabProps) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (body.trim().length === 0) {
      setError("Comment can't be empty.");
      return;
    }
    startTransition(async () => {
      const r = await addCommentAction(leadId, body);
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      setBody("");
    });
  }

  return (
    <div className="space-y-3" data-testid="comments-tab">
      <div className="rounded border border-neutral-200 bg-white p-3">
        <label
          htmlFor="comments-tab-body"
          className="text-xs font-medium uppercase tracking-wide text-neutral-500"
        >
          Add a comment
        </label>
        <textarea
          id="comments-tab-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          disabled={!canComment || pending}
          maxLength={4000}
          className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm"
          placeholder="Internal note — visible to your team only."
          data-testid="comments-tab-textarea"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!canComment || pending || body.trim().length === 0}
            data-testid="comments-tab-submit"
          >
            {pending ? "Saving…" : "Comment"}
          </Button>
          {!canComment && (
            <span
              className="text-xs text-neutral-500"
              data-testid="comments-tab-disabled"
            >
              You don't have permission to add comments here.
            </span>
          )}
          {error && (
            <span
              className="text-xs text-rose-700"
              role="alert"
              data-testid="comments-tab-error"
            >
              {error}
            </span>
          )}
        </div>
      </div>

      {comments.length === 0 ? (
        <p
          className="text-sm text-neutral-500"
          data-testid="comments-tab-empty"
        >
          No comments yet — start the thread above.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              data-testid={`comment-row-${c.id}`}
              className="rounded border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span className="font-mono">
                  {c.created_by.slice(0, 8)}
                </span>
                <time dateTime={c.created_at}>{fmt(c.created_at)}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
