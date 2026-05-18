"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { clearOverrideAction, setOverrideAction } from "./actions";

export type RowProps = {
  role: string;
  permission: string;
  granted: boolean;
  default_granted: boolean;
  override: "allow" | "deny" | null;
  platform_only: boolean;
};

export function OverrideRow(props: RowProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const apply = (mode: "allow" | "deny" | "clear") =>
    start(async () => {
      setError(null);
      let r;
      if (mode === "clear") {
        r = await clearOverrideAction(props.role, props.permission);
      } else {
        r = await setOverrideAction(
          props.role,
          props.permission,
          mode,
          reason
        );
      }
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      setReason("");
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <div className="flex items-center justify-between py-1.5 text-sm border-b last:border-b-0">
        <div className="flex items-center gap-3 min-w-0">
          <code className="font-mono text-xs text-neutral-700 truncate">
            {props.permission}
          </code>
          {props.platform_only && (
            <Badge variant="outline" className="text-[10px]" title="Platform-only — cannot grant to org roles">
              platform-only
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {props.override === "allow" && (
            <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200">
              allow
            </Badge>
          )}
          {props.override === "deny" && (
            <Badge variant="destructive">deny</Badge>
          )}
          {props.override === null && (
            <span className="text-xs text-neutral-500">
              default: {props.default_granted ? "granted" : "denied"}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={props.platform_only}
            onClick={() => {
              setReason("");
              setError(null);
              setOpen(true);
            }}
          >
            Edit
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setReason("");
            setError(null);
          }
          setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {props.role} · {props.permission}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-neutral-600">
              Default for this role:{" "}
              <strong>{props.default_granted ? "granted" : "denied"}</strong>.
              Current effective state: <strong>{props.granted ? "granted" : "denied"}</strong>.
            </p>
            <div className="space-y-1">
              <Label htmlFor="override-reason">Reason</Label>
              <Textarea
                id="override-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this override?"
              />
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            {props.override !== null && (
              <Button
                variant="outline"
                onClick={() => apply("clear")}
                disabled={pending}
              >
                Clear override
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => apply("deny")}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? "Saving…" : "Deny"}
            </Button>
            <Button
              onClick={() => apply("allow")}
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? "Saving…" : "Allow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
