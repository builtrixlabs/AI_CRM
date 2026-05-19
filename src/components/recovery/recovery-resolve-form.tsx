"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resolveRecoveryItemAction } from "@/app/(dashboard)/dashboard/recovery/actions";
import type { RecoveryResolution } from "@/lib/recovery/types";

const OPTIONS: { value: RecoveryResolution; label: string }[] = [
  { value: "won_back", label: "Won back" },
  { value: "unreachable", label: "Unreachable" },
  { value: "confirmed_lost", label: "Confirmed lost" },
];

export function RecoveryResolveForm({
  queueId,
  disabled,
}: {
  queueId: string;
  disabled?: boolean;
}) {
  const [resolution, setResolution] = useState<RecoveryResolution>("won_back");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const onClick = () => {
    start(async () => {
      const r = await resolveRecoveryItemAction(
        queueId,
        resolution,
        note.trim() || undefined,
      );
      if (!r.ok) {
        const msg =
          r.reason === "conflict"
            ? `Cannot resolve: ${r.message ?? "conflict"}`
            : `Cannot resolve: ${r.reason}${r.message ? ` (${r.message})` : ""}`;
        alert(msg);
      } else {
        setNote("");
      }
    });
  };

  return (
    <div
      className="flex flex-wrap items-end gap-2"
      data-testid={`recovery-resolve-${queueId}`}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Resolution
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={resolution}
          onChange={(e) =>
            setResolution(e.target.value as RecoveryResolution)
          }
          disabled={disabled || pending}
          data-testid={`recovery-resolve-pick-${queueId}`}
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Note (optional)
        <input
          type="text"
          className="h-8 w-48 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled || pending}
          data-testid={`recovery-resolve-note-${queueId}`}
        />
      </label>
      <Button
        size="sm"
        onClick={onClick}
        disabled={disabled || pending}
        data-testid={`recovery-resolve-submit-${queueId}`}
      >
        {pending ? "Resolving…" : "Resolve"}
      </Button>
    </div>
  );
}
