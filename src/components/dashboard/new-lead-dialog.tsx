"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_SOURCES } from "@/lib/nodes/schemas/lead";
import { createLeadAction } from "@/app/(dashboard)/dashboard/_actions/leads";

export type NewLeadDialogProps = {
  /** Optional controlled-mode open state. If omitted, the component manages its own state and renders its own trigger button. */
  open?: boolean;
  /** Called when the dialog requests open/close in controlled mode. */
  onOpenChange?: (open: boolean) => void;
  /** When true, suppress the inline trigger button (parent provides one). */
  hideTrigger?: boolean;
};

export function NewLeadDialog(props: NewLeadDialogProps = {}) {
  const isControlled = props.open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? (props.open as boolean) : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) {
      props.onOpenChange?.(v);
    } else {
      setInternalOpen(v);
    }
  };
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setPhone("");
    setSource("");
    setEmail("");
    setNotes("");
    setErrors({});
    setPermissionDenied(false);
  };

  const submit = () => {
    setErrors({});
    setPermissionDenied(false);
    const fd = new FormData();
    fd.append("phone", phone);
    fd.append("source", source);
    if (email.trim()) fd.append("email", email);
    if (notes.trim()) fd.append("notes", notes);
    startTransition(async () => {
      const result = await createLeadAction(fd);
      if (!result.ok) {
        if (result.error === "permission") {
          setPermissionDenied(true);
        } else if (result.error === "validation" && result.fieldErrors) {
          setErrors(result.fieldErrors);
        } else {
          setErrors({ _form: result.message ?? "Failed to create lead." });
        }
        return;
      }
      const id = result.data?.id;
      reset();
      setOpen(false);
      if (id) router.push(`/dashboard/leads/${id}`);
    });
  };

  return (
    <>
      {props.hideTrigger ? null : (
        <Button
          type="button"
          data-testid="new-lead-trigger"
          onClick={() => setOpen(true)}
        >
          + New lead
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
      <DialogContent data-testid="new-lead-dialog">
        <DialogHeader>
          <DialogTitle>Create lead</DialogTitle>
        </DialogHeader>
        {permissionDenied ? (
          <p
            data-testid="permission-banner"
            role="alert"
            className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
          >
            You don&apos;t have permission to create leads.
          </p>
        ) : null}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="new-phone">Phone</Label>
            <Input
              id="new-phone"
              data-testid="new-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {errors.phone ? (
              <p className="text-sm text-rose-700">{errors.phone}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v ?? "")}>
              <SelectTrigger data-testid="new-source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.source ? (
              <p className="text-sm text-rose-700">{errors.source}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-email">Email (optional)</Label>
            <Input
              id="new-email"
              data-testid="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email ? (
              <p className="text-sm text-rose-700">{errors.email}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-notes">Notes (optional)</Label>
            <Textarea
              id="new-notes"
              data-testid="new-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {errors._form ? (
            <p
              data-testid="form-error"
              role="alert"
              className="text-sm text-rose-700"
            >
              {errors._form}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="new-submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  );
}
