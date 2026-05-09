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
  WIDGET_DESCRIPTION,
  WIDGET_LABEL,
  WIDGET_TYPES,
  type WidgetType,
} from "@/lib/dashboards/types";
import { dashboardsAction } from "./actions";

export function NewDashboardDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<WidgetType>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setName("");
    setSelected(new Set());
    setErrors({});
  };

  const toggleWidget = (t: WidgetType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const submit = () => {
    setErrors({});
    if (selected.size === 0) {
      setErrors({ _form: "Pick at least one widget" });
      return;
    }
    const fd = new FormData();
    fd.append("intent", "create");
    fd.append("name", name);
    for (const t of selected) fd.append("widget", t);
    startTransition(async () => {
      const result = await dashboardsAction(fd);
      if (!result.ok) {
        if (result.error === "validation" && result.fieldErrors) {
          setErrors(result.fieldErrors);
        } else {
          setErrors({ _form: result.message ?? "Failed to create dashboard." });
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
        data-testid="new-dashboard-trigger"
        onClick={() => setOpen(true)}
      >
        + New dashboard
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
          data-testid="new-dashboard-dialog"
        >
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-name">Name</Label>
              <Input
                id="dashboard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Sales pulse"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Widgets</Label>
              <div className="space-y-2">
                {WIDGET_TYPES.map((t) => (
                  <label
                    key={t}
                    className="flex items-start gap-2 rounded border p-2 text-sm hover:bg-neutral-50 cursor-pointer"
                    data-testid={`widget-option-${t}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(t)}
                      onChange={() => toggleWidget(t)}
                    />
                    <div>
                      <div className="font-medium">{WIDGET_LABEL[t]}</div>
                      <div className="text-xs text-neutral-500">
                        {WIDGET_DESCRIPTION[t]}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {errors._form && (
                <p className="text-sm text-destructive" role="alert">
                  {errors._form}
                </p>
              )}
            </div>
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
              data-testid="new-dashboard-submit"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Creating…" : "Create dashboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
