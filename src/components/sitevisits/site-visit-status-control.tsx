"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { transitionSiteVisitAction } from "@/app/(dashboard)/dashboard/site-visits/actions";
import type { SiteVisitState } from "@/lib/sitevisits/transitions";

const REASON_REQUIRED: ReadonlySet<SiteVisitState> = new Set<SiteVisitState>([
  "cancelled",
  "no_show",
]);

export const STATE_LABEL: Record<SiteVisitState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export function SiteVisitStatusControl({
  id,
  currentState,
  allowed,
}: {
  id: string;
  currentState: SiteVisitState;
  /** `allowedTransitions(currentState)` — server-computed. */
  allowed: SiteVisitState[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<SiteVisitState | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(next: SiteVisitState) {
    setError(null);
    // First click on a reason-required transition reveals the reason box.
    if (REASON_REQUIRED.has(next) && target !== next) {
      setTarget(next);
      setReason("");
      return;
    }
    startTransition(async () => {
      const result = await transitionSiteVisitAction(
        id,
        next,
        REASON_REQUIRED.has(next) ? reason : undefined,
      );
      if (result.ok) {
        setTarget(null);
        setReason("");
        router.refresh();
      } else {
        setError(result.message ?? result.reason);
      }
    });
  }

  if (allowed.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="sv-status-terminal"
      >
        This visit is in a terminal state ({STATE_LABEL[currentState]}). No
        further transitions are possible.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="sv-status-control">
      <div className="flex flex-wrap gap-2">
        {allowed.map((next) => (
          <Button
            key={next}
            type="button"
            size="sm"
            variant={REASON_REQUIRED.has(next) ? "destructive" : "outline"}
            disabled={pending}
            onClick={() => run(next)}
            data-testid={`sv-transition-${next}`}
          >
            → {STATE_LABEL[next]}
          </Button>
        ))}
      </div>

      {target && REASON_REQUIRED.has(target) && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <label
            htmlFor="sv-reason"
            className="block text-xs font-medium text-amber-900"
          >
            Reason for {STATE_LABEL[target].toLowerCase()} (required)
          </label>
          <textarea
            id="sv-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded border border-amber-300 bg-white p-2 text-sm text-neutral-900"
            data-testid="sv-reason-input"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending || reason.trim().length === 0}
              onClick={() => run(target)}
              data-testid="sv-reason-confirm"
            >
              Confirm {STATE_LABEL[target].toLowerCase()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setTarget(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          className="text-xs text-destructive"
          role="alert"
          data-testid="sv-status-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
