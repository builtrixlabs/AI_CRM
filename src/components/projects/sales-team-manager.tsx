"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  addAssignmentAction,
  removeAssignmentAction,
  setPrimaryAction,
  type SalesTeamActionResult,
} from "@/app/(admin)/admin/projects/[id]/sales-team/actions";
import type {
  ProjectAssignment,
  OrgRep,
} from "@/lib/projects/sales-mapping";

export function SalesTeamManager({
  projectId,
  assignments,
  reps,
}: {
  projectId: string;
  assignments: ProjectAssignment[];
  reps: OrgRep[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState("");

  const assignedIds = new Set(assignments.map((a) => a.sales_rep_id));
  const availableReps = reps.filter((r) => !assignedIds.has(r.id));

  function run(fn: () => Promise<SalesTeamActionResult>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        router.refresh();
      } else {
        setError(r.message ?? r.reason);
      }
    });
  }

  return (
    <div className="space-y-4" data-testid="sales-team-manager">
      <ul className="space-y-2">
        {assignments.length === 0 ? (
          <li
            className="rounded border border-neutral-200 px-4 py-4 text-sm text-neutral-500"
            data-testid="sales-team-empty"
          >
            No sales reps assigned to this project yet.
          </li>
        ) : (
          assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded border border-neutral-200 px-4 py-3"
              data-testid={`sales-team-row-${a.sales_rep_id}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.sales_rep_name}</span>
                {a.is_primary && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-800">
                    Primary
                  </span>
                )}
                {a.sales_rep_on_leave && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800">
                    On leave
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {!a.is_primary && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => setPrimaryAction(projectId, a.sales_rep_id))
                    }
                    data-testid={`sales-team-primary-${a.sales_rep_id}`}
                  >
                    Make primary
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => removeAssignmentAction(projectId, a.sales_rep_id))
                  }
                  data-testid={`sales-team-remove-${a.sales_rep_id}`}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-end gap-2 rounded border border-neutral-200 p-3">
        <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-600">
          Add a sales rep
          <select
            className="h-8 rounded border border-neutral-300 px-2 text-sm"
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            data-testid="sales-team-add-select"
          >
            <option value="">Select a rep…</option>
            {availableReps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name} · {r.base_role}
                {r.on_leave ? " (on leave)" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          disabled={pending || !selectedRep}
          onClick={() => {
            if (!selectedRep) return;
            const rep = selectedRep;
            setSelectedRep("");
            run(() => addAssignmentAction(projectId, rep));
          }}
          data-testid="sales-team-add-btn"
        >
          Add
        </Button>
      </div>

      {error && (
        <p
          className="text-xs text-red-600"
          role="alert"
          data-testid="sales-team-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
