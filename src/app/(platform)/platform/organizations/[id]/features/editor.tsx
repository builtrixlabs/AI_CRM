"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteFlagAction, setFlagAction } from "./actions";

type Props = {
  organizationId: string;
  initial: Record<string, unknown>;
};

export function FeatureFlagsEditor({ organizationId, initial }: Props) {
  const [flags, setFlags] = useState<Record<string, unknown>>(initial);
  const [newFlagName, setNewFlagName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (flag: string, value: boolean) => {
    setError(null);
    start(async () => {
      const r = await setFlagAction(organizationId, flag, value);
      if (r.ok) {
        setFlags((f) => ({ ...f, [flag]: value }));
      } else {
        setError(`Could not toggle ${flag}: ${r.reason}`);
      }
    });
  };

  const addFlag = () => {
    setError(null);
    if (!newFlagName.trim()) return;
    const flag = newFlagName.trim();
    start(async () => {
      const r = await setFlagAction(organizationId, flag, true);
      if (r.ok) {
        setFlags((f) => ({ ...f, [flag]: true }));
        setNewFlagName("");
      } else {
        setError(
          r.reason === "validation"
            ? "Flag names must be lowercase letters, digits, underscores."
            : `Could not add: ${r.reason}`,
        );
      }
    });
  };

  const removeFlag = (flag: string) => {
    setError(null);
    start(async () => {
      const r = await deleteFlagAction(organizationId, flag);
      if (r.ok) {
        setFlags((f) => {
          const { [flag]: _omit, ...rest } = f;
          void _omit;
          return rest;
        });
      } else {
        setError(`Could not remove ${flag}: ${r.reason}`);
      }
    });
  };

  const entries = Object.entries(flags);

  return (
    <div className="space-y-4" data-testid="feature-flags-editor">
      {entries.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="feature-flags-empty"
        >
          No flags set. Add one below.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([flag, value]) => {
            const isBoolean = typeof value === "boolean";
            return (
              <li
                key={flag}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                data-testid={`flag-row-${flag}`}
              >
                <span className="font-mono text-sm">{flag}</span>
                <div className="flex items-center gap-2">
                  {isBoolean ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={value as boolean}
                        onChange={(e) => toggle(flag, e.target.checked)}
                        disabled={pending}
                        data-testid={`flag-toggle-${flag}`}
                      />
                      <span>{(value as boolean) ? "enabled" : "disabled"}</span>
                    </label>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {JSON.stringify(value)}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => removeFlag(flag)}
                    disabled={pending}
                    data-testid={`flag-remove-${flag}`}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="new-flag">Add flag</Label>
          <Input
            id="new-flag"
            value={newFlagName}
            onChange={(e) => setNewFlagName(e.target.value)}
            placeholder="recovery_team_enabled"
            data-testid="flag-new-name"
          />
        </div>
        <Button
          onClick={addFlag}
          disabled={pending || !newFlagName.trim()}
          data-testid="flag-add"
        >
          Add
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid="flag-error">
          {error}
        </p>
      )}
    </div>
  );
}
