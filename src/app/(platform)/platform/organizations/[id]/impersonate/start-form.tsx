"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startImpersonationAction } from "./actions";

export function StartImpersonationForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await startImpersonationAction(organizationId, reason);
      if (!r.ok) {
        setError(
          r.reason === "validation"
            ? r.message === "reason_too_short"
              ? "Reason must be at least 10 characters."
              : "Validation failed."
            : r.reason === "permission"
              ? "Super-admin only."
              : r.reason === "not_found"
                ? "Organization not found."
                : `Internal error: ${r.message ?? ""}`,
        );
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="impersonate-start-form">
      <div>
        <Label htmlFor="reason">Reason (min 10 chars)</Label>
        <Textarea
          id="reason"
          name="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Spot-check the brochure agent flow at the request of org_admin."
          required
          data-testid="impersonate-reason"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid="impersonate-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="impersonate-submit">
        {pending ? "Starting…" : "Start impersonation"}
      </Button>
    </form>
  );
}
