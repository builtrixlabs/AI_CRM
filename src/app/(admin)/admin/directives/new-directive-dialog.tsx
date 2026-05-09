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
  ACTION_KIND_OPTIONS,
  TRIGGER_KIND_OPTIONS,
  defaultTierForAction,
} from "@/lib/doe/authoring-types";
import type { ActionKind, TriggerKind } from "@/lib/doe/types";
import { directiveAction } from "./actions";

const TIER_OPTIONS = ["T0", "T1", "T2", "T3"] as const;

export function NewDirectiveDialog() {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [triggerKind, setTriggerKind] = useState<TriggerKind | "">("");
  const [triggerConfig, setTriggerConfig] = useState("{}");
  const [actionKind, setActionKind] = useState<ActionKind | "">("");
  const [actionConfig, setActionConfig] = useState("{}");
  const [tier, setTier] = useState<(typeof TIER_OPTIONS)[number] | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const computedDefaultTier = actionKind
    ? defaultTierForAction(actionKind as ActionKind)
    : null;
  const effectiveTier = tier || computedDefaultTier;
  const willRequireApproval =
    effectiveTier === "T3" || effectiveTier === "T4";

  const reset = () => {
    setDisplayName("");
    setTriggerKind("");
    setTriggerConfig("{}");
    setActionKind("");
    setActionConfig("{}");
    setTier("");
    setErrors({});
  };

  const submit = () => {
    setErrors({});
    if (!triggerKind) {
      setErrors({ trigger_kind: "Pick a trigger" });
      return;
    }
    if (!actionKind) {
      setErrors({ action_kind: "Pick an action" });
      return;
    }
    const fd = new FormData();
    fd.append("intent", "create");
    fd.append("display_name", displayName);
    fd.append("trigger_kind", triggerKind);
    fd.append("trigger_config", triggerConfig.trim() || "{}");
    fd.append("action_kind", actionKind);
    fd.append("action_config", actionConfig.trim() || "{}");
    if (tier) fd.append("tier", tier);
    fd.append("enabled", "true");
    startTransition(async () => {
      const result = await directiveAction(fd);
      if (!result.ok) {
        if (result.error === "validation" && result.fieldErrors) {
          setErrors(result.fieldErrors);
        } else {
          setErrors({ _form: result.message ?? "Failed to create directive." });
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
        data-testid="new-directive-trigger"
        onClick={() => setOpen(true)}
      >
        + New directive
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          setOpen(v);
        }}
      >
        <DialogContent className="max-w-lg" data-testid="new-directive-dialog">
          <DialogHeader>
            <DialogTitle>New directive</DialogTitle>
          </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Notify rep when intent score crosses 80"
            />
            {errors.display_name && (
              <p className="text-xs text-destructive">{errors.display_name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trigger_kind">Trigger</Label>
            <Select
              value={triggerKind}
              onValueChange={(v) => setTriggerKind(v as TriggerKind)}
            >
              <SelectTrigger id="trigger_kind">
                <SelectValue placeholder="Select a trigger…" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_KIND_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.trigger_kind && (
              <p className="text-xs text-destructive">{errors.trigger_kind}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trigger_config">
              Trigger config <span className="text-neutral-400">(JSON)</span>
            </Label>
            <Textarea
              id="trigger_config"
              value={triggerConfig}
              onChange={(e) => setTriggerConfig(e.target.value)}
              rows={2}
              className="font-mono text-xs"
            />
            {errors.trigger_config && (
              <p className="text-xs text-destructive">
                {errors.trigger_config}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="action_kind">Action</Label>
            <Select
              value={actionKind}
              onValueChange={(v) => setActionKind(v as ActionKind)}
            >
              <SelectTrigger id="action_kind">
                <SelectValue placeholder="Select an action…" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_KIND_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.action_kind && (
              <p className="text-xs text-destructive">{errors.action_kind}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="action_config">
              Action config <span className="text-neutral-400">(JSON)</span>
            </Label>
            <Textarea
              id="action_config"
              value={actionConfig}
              onChange={(e) => setActionConfig(e.target.value)}
              rows={2}
              className="font-mono text-xs"
            />
            {errors.action_config && (
              <p className="text-xs text-destructive">
                {errors.action_config}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tier">
              Tier{" "}
              <span className="text-neutral-400">
                (defaults to {computedDefaultTier ?? "—"} for the action)
              </span>
            </Label>
            <Select
              value={tier}
              onValueChange={(v) =>
                setTier(v as (typeof TIER_OPTIONS)[number])
              }
            >
              <SelectTrigger id="tier">
                <SelectValue placeholder="Use default for action" />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {willRequireApproval && (
              <p className="text-xs text-amber-700">
                T3+ directives require manual approval each time they fire.
              </p>
            )}
          </div>

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
            data-testid="new-directive-submit"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Creating…" : "Create directive"}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
