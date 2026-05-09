"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { performSubAction } from "./actions";
import type { OrgSubscriptionRow } from "@/lib/platform/subscriptions";
import { PLAN_TIER_ORDER, PLAN_TIERS } from "@/lib/platform/plan-tiers";

type DialogKind = "change_tier" | "suspend" | "cancel" | null;

export function SubRowActions({ row }: { row: OrgSubscriptionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<DialogKind>(null);
  const [tier, setTier] = useState<string>(row.plan_tier);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason("");
    setError(null);
    setTier(row.plan_tier);
  };

  const close = () => {
    reset();
    setOpen(null);
  };

  const dispatch = (kind: "change_tier" | "suspend" | "cancel" | "reactivate") =>
    start(async () => {
      setError(null);
      let result;
      if (kind === "change_tier") {
        result = await performSubAction({
          kind: "change_tier",
          org_id: row.organization_id,
          new_tier: tier,
        });
      } else if (kind === "suspend") {
        result = await performSubAction({
          kind: "suspend",
          org_id: row.organization_id,
          reason,
        });
      } else if (kind === "cancel") {
        result = await performSubAction({
          kind: "cancel",
          org_id: row.organization_id,
          reason,
        });
      } else {
        result = await performSubAction({
          kind: "reactivate",
          org_id: row.organization_id,
        });
      }
      if (!result.ok) {
        setError(result.message ?? result.error);
      } else {
        close();
        router.refresh();
      }
    });

  const isTerminal = row.status === "cancelled";

  return (
    <div className="flex items-center gap-2 justify-end">
      <Button size="sm" variant="outline" onClick={() => setOpen("change_tier")}>
        Change plan
      </Button>

      {row.status === "active" && (
        <Button size="sm" variant="outline" onClick={() => setOpen("suspend")}>
          Suspend
        </Button>
      )}
      {row.status === "suspended" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch("reactivate")}
          disabled={pending}
        >
          {pending ? "Reactivating…" : "Reactivate"}
        </Button>
      )}
      {!isTerminal && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setOpen("cancel")}
        >
          Cancel
        </Button>
      )}

      <Dialog
        open={open === "change_tier"}
        onOpenChange={(v) => (v ? setOpen("change_tier") : close())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan tier — {row.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="tier-select">New tier</Label>
            <select
              id="tier-select"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {PLAN_TIER_ORDER.map((t) => (
                <option key={t} value={t}>
                  {PLAN_TIERS[t].display_name}
                </option>
              ))}
            </select>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => dispatch("change_tier")}
              disabled={pending || tier === row.plan_tier}
            >
              {pending ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "suspend"}
        onOpenChange={(v) => (v ? setOpen("suspend") : close())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {row.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this org being suspended?"
            />
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => dispatch("suspend")}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? "Suspending…" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "cancel"}
        onOpenChange={(v) => (v ? setOpen("cancel") : close())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription · {row.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-neutral-700">
              Cancelling sets <code className="font-mono">status=cancelled</code>{" "}
              and <code className="font-mono">current_period_end</code> to 30
              days from now (grace).
            </p>
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this org being cancelled?"
            />
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              onClick={() => dispatch("cancel")}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? "Cancelling…" : "Cancel subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
