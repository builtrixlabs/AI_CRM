"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  TERMINAL_STATES,
  allowedTransitions,
  isTerminal,
  type LeadState,
} from "@/lib/leads/transitions";
import { transitionLeadAction } from "@/app/(dashboard)/dashboard/_actions/leads";
import { TransitionReasonDialog } from "./transition-reason-dialog";

type Props = {
  lead_id: string;
  current_state: LeadState;
};

const LABELS: Record<LeadState, string> = {
  new: "New",
  contacted: "Mark contacted",
  qualified: "Mark qualified",
  lost: "Mark lost",
  on_hold: "Mark on hold",
  junk: "Mark junk",
};

export function TransitionFooter({ lead_id, current_state }: Props) {
  const [pendingTarget, setPendingTarget] = useState<LeadState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reasonForState, setReasonForState] = useState<LeadState | null>(null);

  if (isTerminal(current_state)) {
    return (
      <div
        data-testid="transition-footer"
        data-terminal="true"
        className="rounded-md border border-neutral-200 p-4 text-sm text-neutral-600"
      >
        (Terminal — reactivation in V1.)
      </div>
    );
  }

  const allowed = allowedTransitions(current_state);

  const handleClick = (target: LeadState) => {
    setErrorMessage(null);
    if (TERMINAL_STATES.has(target)) {
      setReasonForState(target);
      return;
    }
    setPendingTarget(target);
    const fd = new FormData();
    fd.append("lead_id", lead_id);
    fd.append("target_state", target);
    startTransition(async () => {
      const result = await transitionLeadAction(fd);
      if (!result.ok) {
        setErrorMessage(result.message ?? "Failed to update lead.");
      }
      setPendingTarget(null);
    });
  };

  return (
    <div
      data-testid="transition-footer"
      data-terminal="false"
      className="space-y-2"
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
        Move to
      </h2>
      <div className="flex flex-wrap gap-2">
        {allowed.map((target) => (
          <Button
            key={target}
            type="button"
            variant={TERMINAL_STATES.has(target) ? "outline" : "default"}
            data-testid={`transition-${target}`}
            disabled={pending && pendingTarget === target}
            onClick={() => handleClick(target)}
          >
            {pending && pendingTarget === target ? "Saving…" : LABELS[target]}
          </Button>
        ))}
      </div>
      {errorMessage ? (
        <p
          data-testid="transition-error"
          role="alert"
          className="text-sm text-rose-700"
        >
          {errorMessage}
        </p>
      ) : null}
      {reasonForState ? (
        <TransitionReasonDialog
          open
          lead_id={lead_id}
          target_state={reasonForState}
          onClose={() => setReasonForState(null)}
        />
      ) : null}
    </div>
  );
}
