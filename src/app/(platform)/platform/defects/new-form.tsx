"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDefectAction } from "./actions";
import {
  DEFECT_SEVERITIES,
  type DefectSeverity,
} from "@/lib/platform/defects";

export function NewDefectForm() {
  const router = useRouter();
  const [severity, setSeverity] = useState<DefectSeverity>("P2");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createDefectAction({
        severity,
        title,
        description,
        organization_id: organizationId.trim() || undefined,
      });
      if (!r.ok) {
        setError(`Could not create defect: ${r.reason}`);
      } else {
        setTitle("");
        setDescription("");
        setOrganizationId("");
        setSeverity("P2");
        if (r.id) router.push(`/platform/defects/${r.id}`);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="new-defect-form">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="severity">Severity</Label>
          <select
            id="severity"
            className="block h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as DefectSeverity)}
            data-testid="defect-severity"
          >
            {DEFECT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="org">Organization (optional)</Label>
          <Input
            id="org"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            placeholder="uuid"
            data-testid="defect-org-id"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          data-testid="defect-title"
        />
      </div>
      <div>
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          data-testid="defect-description"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid="defect-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="defect-submit">
        {pending ? "Logging…" : "Log defect"}
      </Button>
    </form>
  );
}
