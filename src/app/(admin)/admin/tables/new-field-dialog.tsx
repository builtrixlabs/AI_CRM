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
import {
  CUSTOM_FIELD_KINDS,
  FIELD_KIND_LABEL,
  type CustomFieldKind,
  type CustomFieldNodeType,
} from "@/lib/customfields/types";
import { customFieldsAction } from "./actions";

export function NewFieldDialog({
  node_type,
}: {
  node_type: CustomFieldNodeType;
}) {
  const [open, setOpen] = useState(false);
  const [fieldKey, setFieldKey] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<CustomFieldKind | "">("");
  const [required, setRequired] = useState(false);
  const [optionsCsv, setOptionsCsv] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setFieldKey("");
    setLabel("");
    setKind("");
    setRequired(false);
    setOptionsCsv("");
    setErrors({});
  };

  const submit = () => {
    setErrors({});
    if (!kind) {
      setErrors({ kind: "Pick a field kind" });
      return;
    }
    const fd = new FormData();
    fd.append("intent", "create");
    fd.append("node_type", node_type);
    fd.append("field_key", fieldKey);
    fd.append("label", label);
    fd.append("kind", kind);
    if (required) fd.append("required", "true");
    if (optionsCsv.trim()) fd.append("options", optionsCsv);
    fd.append("sort_order", "100");
    startTransition(async () => {
      const result = await customFieldsAction(fd);
      if (!result.ok) {
        if (result.error === "validation" && result.fieldErrors) {
          setErrors(result.fieldErrors);
        } else {
          setErrors({ _form: result.message ?? "Failed to create field." });
        }
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid={`new-field-${node_type}`}
        onClick={() => setOpen(true)}
      >
        + Add field
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          setOpen(v);
        }}
      >
        <DialogContent
          className="max-w-md"
          data-testid={`new-field-dialog-${node_type}`}
        >
          <DialogHeader>
            <DialogTitle>New custom field — {node_type}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="field-key">Field key</Label>
              <Input
                id="field-key"
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                placeholder="budget_inr"
                maxLength={40}
                className="font-mono text-sm"
              />
              {errors.field_key && (
                <p className="text-xs text-destructive">{errors.field_key}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="field-label">Label</Label>
              <Input
                id="field-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                placeholder="Budget (₹)"
              />
              {errors.label && (
                <p className="text-xs text-destructive">{errors.label}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="field-kind">Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as CustomFieldKind)}
              >
                <SelectTrigger id="field-kind">
                  <SelectValue placeholder="Choose a kind…" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_FIELD_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {FIELD_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.kind && (
                <p className="text-xs text-destructive">{errors.kind}</p>
              )}
            </div>

            {kind === "select" && (
              <div className="space-y-1.5">
                <Label htmlFor="field-options">
                  Options{" "}
                  <span className="text-xs text-neutral-500">
                    (one per line or comma-separated)
                  </span>
                </Label>
                <Textarea
                  id="field-options"
                  value={optionsCsv}
                  onChange={(e) => setOptionsCsv(e.target.value)}
                  rows={3}
                  className="text-sm"
                  placeholder="2BHK&#10;3BHK&#10;4BHK"
                />
                {errors.options && (
                  <p className="text-xs text-destructive">{errors.options}</p>
                )}
              </div>
            )}

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              Required
            </label>

            {errors._form && (
              <p className="text-sm text-destructive" role="alert">
                {errors._form}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              data-testid="new-field-submit"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Creating…" : "Create field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
