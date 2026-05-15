"use client";

import { useState, useTransition } from "react";
import { setAgentPolicyAction } from "./actions";
import type { AgentMessagePolicy } from "@/lib/agents/send-policy";

export type PolicyRow = {
  agent_kind: string;
  label: string;
  description: string;
  mode: AgentMessagePolicy;
  /** site_visit_booking and friends — structurally cannot auto-send. */
  locked: boolean;
};

export function PoliciesForm({ rows }: { rows: PolicyRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <PolicyRowItem key={row.agent_kind} row={row} />
      ))}
    </div>
  );
}

function PolicyRowItem({ row }: { row: PolicyRow }) {
  const [mode, setMode] = useState<AgentMessagePolicy>(row.mode);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const autoSend = mode === "auto_send";

  function toggle() {
    if (row.locked) return;
    const next: AgentMessagePolicy = autoSend
      ? "require_approval"
      : "auto_send";
    setErr(null);
    startTransition(async () => {
      const r = await setAgentPolicyAction(row.agent_kind, next);
      if (!r.ok) {
        setErr(r.message ?? r.error);
        return;
      }
      setMode(r.mode);
    });
  }

  return (
    <div
      className="rounded border border-neutral-200 bg-white p-4 space-y-2"
      data-testid={`policy-row-${row.agent_kind}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{row.label}</p>
          <p className="text-xs text-neutral-500">{row.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="text-xs font-medium tabular-nums text-neutral-600"
            data-testid={`policy-mode-${row.agent_kind}`}
          >
            {autoSend ? "Auto-send" : "Require approval"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoSend}
            aria-label={`${row.label}: ${
              autoSend ? "switch to require approval" : "switch to auto-send"
            }`}
            disabled={row.locked || pending}
            onClick={toggle}
            className={`inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
              autoSend
                ? "bg-neutral-900 border-neutral-900"
                : "bg-neutral-200 border-neutral-300"
            } ${row.locked ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                autoSend ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
      {row.locked && (
        <p className="text-xs text-neutral-400">
          Always requires approval — this agent cannot auto-send.
        </p>
      )}
      {err && (
        <p className="text-xs text-rose-700" data-testid={`policy-error-${row.agent_kind}`}>
          {err}
        </p>
      )}
    </div>
  );
}
