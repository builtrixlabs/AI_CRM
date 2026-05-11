"use client";

import { useState, useTransition } from "react";
import {
  BOOKING_STAGES,
  BOOKING_STAGE_LABEL,
  allowedForwardTargets,
  backwardCorrectionTarget,
  isTerminal,
  stageOrdinal,
  type BookingStage,
  type ForwardSkipReason,
} from "@/lib/booking/stages";
import type { StageTransition } from "@/lib/booking/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transitionDealStageAction } from "@/app/(dashboard)/dashboard/deals/[id]/actions";

type Props = {
  dealId: string;
  currentStage: BookingStage;
  transitions: StageTransition[];
  isOrgAdmin: boolean;
};

export function DealStageTracker({
  dealId,
  currentStage,
  transitions,
  isOrgAdmin,
}: Props) {
  const [forwardOpen, setForwardOpen] = useState(false);
  const [backOpen, setBackOpen] = useState(false);

  const currentIdx = stageOrdinal(currentStage);
  const forwardTargets = allowedForwardTargets(currentStage);
  const backwardTarget = backwardCorrectionTarget(currentStage);
  const terminal = isTerminal(currentStage);

  return (
    <Card data-testid="deal-stage-tracker">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Booking pipeline</CardTitle>
        <div className="flex items-center gap-2">
          {!terminal && forwardTargets.length > 0 ? (
            <Button
              type="button"
              size="sm"
              data-testid="advance-stage-button"
              onClick={() => setForwardOpen(true)}
            >
              Advance stage
            </Button>
          ) : null}
          {isOrgAdmin && backwardTarget ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="rollback-stage-button"
              onClick={() => setBackOpen(true)}
            >
              Roll back
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol
          className="flex items-center gap-1 overflow-x-auto"
          aria-label="Booking pipeline stages"
        >
          {BOOKING_STAGES.map((s, i) => {
            const reached = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <li key={s} className="flex items-center gap-1 shrink-0">
                <span
                  data-testid={`stage-chip-${s}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`text-xs px-2 py-1 rounded-md ${
                    isCurrent
                      ? "bg-indigo-600 text-white"
                      : reached
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {BOOKING_STAGE_LABEL[s]}
                </span>
                {i < BOOKING_STAGES.length - 1 ? (
                  <span aria-hidden className="text-xs text-neutral-400">
                    →
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <section
          data-testid="stage-history"
          aria-label="Stage transition history"
        >
          <h3 className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">
            History ({transitions.length})
          </h3>
          {transitions.length === 0 ? (
            <p className="text-sm text-neutral-500">No transitions yet.</p>
          ) : (
            <ul className="space-y-2">
              {transitions.map((t) => {
                const ev = JSON.stringify(t.evidence);
                return (
                  <li
                    key={t.id}
                    data-testid={`history-row-${t.id}`}
                    className="text-sm flex items-baseline gap-2 flex-wrap"
                  >
                    <Badge variant="outline" className="font-mono text-xs">
                      {(t.from_stage ?? "—") + " → " + t.to_stage}
                    </Badge>
                    <span className="text-xs text-neutral-500">
                      {t.actor_kind} ·{" "}
                      {new Date(t.occurred_at).toLocaleString("en-IN")}
                    </span>
                    <span
                      className="text-xs text-neutral-500 truncate max-w-md"
                      title={ev}
                    >
                      {ev.slice(0, 60)}
                      {ev.length > 60 ? "…" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>

      {forwardOpen ? (
        <ForwardTransitionDialog
          dealId={dealId}
          currentStage={currentStage}
          targets={forwardTargets}
          onClose={() => setForwardOpen(false)}
        />
      ) : null}
      {backOpen && backwardTarget ? (
        <BackwardCorrectionDialog
          dealId={dealId}
          currentStage={currentStage}
          target={backwardTarget}
          onClose={() => setBackOpen(false)}
        />
      ) : null}
    </Card>
  );
}

function targetKeyOf(t: {
  to: BookingStage;
  skipReason?: ForwardSkipReason;
}): string {
  return t.skipReason ? `${t.to}__${t.skipReason}` : t.to;
}

function ForwardTransitionDialog({
  dealId,
  currentStage,
  targets,
  onClose,
}: {
  dealId: string;
  currentStage: BookingStage;
  targets: Array<{ to: BookingStage; skipReason?: ForwardSkipReason }>;
  onClose: () => void;
}) {
  const firstKey = targets.length > 0 ? targetKeyOf(targets[0]!) : "";
  const [targetKey, setTargetKey] = useState<string>(firstKey);
  const [evidence, setEvidence] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(evidence);
    } catch {
      setError("Evidence must be valid JSON.");
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed as Record<string, unknown>).length === 0
    ) {
      setError("Evidence must be a non-empty JSON object.");
      return;
    }
    const target = targets.find((t) => targetKeyOf(t) === targetKey);
    if (!target) {
      setError("No target selected.");
      return;
    }
    const fd = new FormData();
    fd.append("deal_id", dealId);
    fd.append("to_stage", target.to);
    fd.append("evidence", JSON.stringify(parsed));
    if (target.skipReason) fd.append("skip_reason", target.skipReason);
    startTransition(async () => {
      const r = await transitionDealStageAction(fd);
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      setEvidence("");
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="advance-stage-dialog">
        <DialogHeader>
          <DialogTitle>Advance stage</DialogTitle>
          <DialogDescription>
            Current: <strong>{BOOKING_STAGE_LABEL[currentStage]}</strong>. Pick
            a target and record evidence as a JSON object — the entry is
            appended to the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="target-stage">Target stage</Label>
            <Select
              value={targetKey}
              onValueChange={(v) => {
                if (v != null) setTargetKey(v);
              }}
            >
              <SelectTrigger id="target-stage" data-testid="target-stage-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((t) => (
                  <SelectItem key={targetKeyOf(t)} value={targetKeyOf(t)}>
                    {BOOKING_STAGE_LABEL[t.to]}
                    {t.skipReason
                      ? ` (skip — ${t.skipReason.replace("_", " ")})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="evidence-textarea">Evidence (JSON)</Label>
            <Textarea
              id="evidence-textarea"
              data-testid="evidence-textarea"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={4}
              placeholder={'{"receipt_no": "TKN-001", "amount_inr": 100000}'}
            />
          </div>
          {error ? (
            <p
              role="alert"
              data-testid="advance-error"
              className="text-sm text-rose-700"
            >
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="advance-submit"
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Saving…" : "Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BackwardCorrectionDialog({
  dealId,
  currentStage,
  target,
  onClose,
}: {
  dealId: string;
  currentStage: BookingStage;
  target: BookingStage;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("Correction reason is required.");
      return;
    }
    const fd = new FormData();
    fd.append("deal_id", dealId);
    fd.append("to_stage", target);
    fd.append("correction_reason", trimmed);
    fd.append(
      "evidence",
      JSON.stringify({ correction: true, reason: trimmed })
    );
    startTransition(async () => {
      const r = await transitionDealStageAction(fd);
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      setReason("");
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="rollback-stage-dialog">
        <DialogHeader>
          <DialogTitle>Roll back stage</DialogTitle>
          <DialogDescription>
            Reverting <strong>{BOOKING_STAGE_LABEL[currentStage]}</strong> →{" "}
            <strong>{BOOKING_STAGE_LABEL[target]}</strong>. Correction is
            recorded in the audit log with provenance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rollback-reason">Correction reason</Label>
          <Textarea
            id="rollback-reason"
            data-testid="rollback-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          {error ? (
            <p
              role="alert"
              data-testid="rollback-error"
              className="text-sm text-rose-700"
            >
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="rollback-submit"
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Saving…" : "Roll back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
