"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  claimCoordinationAction,
  releaseCoordinationAction,
} from "@/app/(dashboard)/dashboard/site-visits/actions";

export function CoordinatorClaimBanner({
  date,
  claimedBySelf,
  claimedByLabel,
  canCoordinate,
}: {
  /** IST "YYYY-MM-DD" the banner coordinates. */
  date: string;
  claimedBySelf: boolean;
  /** Display name (or id) of the current claimant, or null if unclaimed. */
  claimedByLabel: string | null;
  canCoordinate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function claim() {
    setError(null);
    startTransition(async () => {
      const r = await claimCoordinationAction(date);
      if (r.ok) router.refresh();
      else setError(r.message ?? r.reason);
    });
  }

  function release() {
    setError(null);
    startTransition(async () => {
      const r = await releaseCoordinationAction(date);
      if (r.ok) router.refresh();
      else setError(r.message ?? r.reason);
    });
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
      data-testid="sv-coordinator-banner"
    >
      <div className="text-sm">
        <span className="font-medium">Coordination · {date}</span>{" "}
        {claimedByLabel ? (
          <span className="text-muted-foreground" data-testid="sv-coordinator-claimed">
            {claimedBySelf
              ? "claimed by you"
              : `claimed by ${claimedByLabel}`}
          </span>
        ) : (
          <span className="text-muted-foreground" data-testid="sv-coordinator-unclaimed">
            unclaimed
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {claimedBySelf && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={release}
            data-testid="sv-release-btn"
          >
            Release
          </Button>
        )}
        {!claimedByLabel && canCoordinate && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={claim}
            data-testid="sv-claim-btn"
          >
            Claim coordination
          </Button>
        )}
      </div>
      {error && (
        <p className="w-full text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
