"use client";
import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { transitionLeadAction } from "@/app/(dashboard)/dashboard/_actions/leads";
import type { LeadState } from "@/lib/leads/types";

type Props = {
  open: boolean;
  lead_id: string;
  target_state: LeadState;
  onClose: () => void;
};

const TARGET_LABELS: Record<LeadState, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  lost: "Lost",
  on_hold: "On hold",
  junk: "Junk",
};

export function TransitionReasonDialog({ open, lead_id, target_state, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = () => {
    setErrorMessage(null);
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setErrorMessage("Reason is required.");
      return;
    }
    const fd = new FormData();
    fd.append("lead_id", lead_id);
    fd.append("target_state", target_state);
    fd.append("reason", trimmed);
    startTransition(async () => {
      const result = await transitionLeadAction(fd);
      if (!result.ok) {
        setErrorMessage(result.message ?? "Failed to update lead.");
        return;
      }
      setReason("");
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="transition-reason-dialog">
        <DialogHeader>
          <DialogTitle>Mark as {TARGET_LABELS[target_state]}</DialogTitle>
          <DialogDescription>
            Please record a reason. This is appended to the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason-textarea">Reason</Label>
          <Textarea
            id="reason-textarea"
            data-testid="reason-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          {errorMessage ? (
            <p
              data-testid="reason-error"
              role="alert"
              className="text-sm text-rose-700"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="reason-submit"
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
