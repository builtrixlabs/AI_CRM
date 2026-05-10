"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { promoteLeadToDealAction } from "@/app/(dashboard)/dashboard/_actions/leads";

/**
 * D-321 — "Promote to deal" button on the lead canvas. Calls the server
 * action; on success, navigates to the new deal canvas.
 */
export function PromoteToDealButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    setError(null);
    start(async () => {
      const r = await promoteLeadToDealAction(leadId);
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      router.push(`/dashboard/deals/${r.deal_id}`);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "Promoting..." : "Promote to deal"}
      </Button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
