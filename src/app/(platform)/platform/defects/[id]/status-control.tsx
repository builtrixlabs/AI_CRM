"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateDefectAction } from "../actions";
import {
  DEFECT_STATUSES,
  type DefectStatus,
} from "@/lib/platform/defects";

export function DefectStatusControl({
  id,
  status,
}: {
  id: string;
  status: DefectStatus;
}) {
  const [current, setCurrent] = useState<DefectStatus>(status);
  const [pending, start] = useTransition();

  const setStatus = (next: DefectStatus) => {
    start(async () => {
      const r = await updateDefectAction({ id, status: next });
      if (r.ok) setCurrent(next);
      else alert(`Could not change status: ${r.reason}`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="defect-status-control">
      <span className="text-sm text-muted-foreground">
        Current: <span className="font-medium">{current}</span>
      </span>
      <div className="flex gap-2">
        {DEFECT_STATUSES.filter((s) => s !== current).map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            onClick={() => setStatus(s)}
            disabled={pending}
            data-testid={`defect-status-${s}`}
          >
            {s.replace(/_/g, " ")}
          </Button>
        ))}
      </div>
    </div>
  );
}
