"use client";
import { useState, useTransition } from "react";
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
import type { CanvasLead } from "@/lib/canvas/types";
import { updateLeadAction } from "@/app/(dashboard)/dashboard/_actions/leads";

type Props = {
  lead: CanvasLead;
  onSaved: () => void;
  onCancel: () => void;
};

export function EditLeadForm({ lead, onSaved, onCancel }: Props) {
  const data = lead.data as unknown as Record<string, unknown>;
  const [label, setLabel] = useState(lead.label);
  const [phone, setPhone] = useState(String(data.phone ?? ""));
  const [source, setSource] = useState(String(data.source ?? ""));
  const [email, setEmail] = useState(String(data.email ?? ""));
  const [notes, setNotes] = useState(String(data.notes ?? ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setErrors({});
    const fd = new FormData();
    fd.append("label", label);
    fd.append("phone", phone);
    fd.append("source", source);
    if (email.trim()) fd.append("email", email);
    if (notes.trim()) fd.append("notes", notes);
    startTransition(async () => {
      const result = await updateLeadAction(lead.id, fd);
      if (!result.ok) {
        if (result.error === "validation" && result.fieldErrors) {
          setErrors(result.fieldErrors);
        } else {
          setErrors({ _form: result.message ?? "Failed to save." });
        }
        return;
      }
      onSaved();
    });
  };

  return (
    <form
      data-testid="edit-lead-form"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="edit-label">Label</Label>
        <Input
          id="edit-label"
          data-testid="edit-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {errors.label ? <p className="text-sm text-rose-700">{errors.label}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-phone">Phone</Label>
        <Input
          id="edit-phone"
          data-testid="edit-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {errors.phone ? <p className="text-sm text-rose-700">{errors.phone}</p> : null}
      </div>
      <div className="space-y-1">
        <Label>Source</Label>
        <Select value={source} onValueChange={(v) => setSource(v ?? "")}>
          <SelectTrigger data-testid="edit-source">
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
        {errors.source ? <p className="text-sm text-rose-700">{errors.source}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-email">Email (optional)</Label>
        <Input
          id="edit-email"
          data-testid="edit-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {errors.email ? <p className="text-sm text-rose-700">{errors.email}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-notes">Notes (optional)</Label>
        <Textarea
          id="edit-notes"
          data-testid="edit-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {errors.notes ? <p className="text-sm text-rose-700">{errors.notes}</p> : null}
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
      <div className="flex items-center gap-2">
        <Button type="submit" data-testid="edit-save" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="edit-cancel"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
