"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { claimRecoveryItemAction } from "@/app/(dashboard)/dashboard/recovery/actions";

export function RecoveryClaimButton({
  queueId,
  disabled,
}: {
  queueId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const onClick = () => {
    start(async () => {
      const r = await claimRecoveryItemAction(queueId);
      if (!r.ok) {
        const msg =
          r.reason === "conflict"
            ? `Cannot claim: ${r.message ?? "already claimed"}`
            : `Cannot claim: ${r.reason}`;
        alert(msg);
      }
    });
  };
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      disabled={disabled || pending}
      data-testid={`recovery-claim-${queueId}`}
    >
      {pending ? "Claiming…" : "Claim"}
    </Button>
  );
}
