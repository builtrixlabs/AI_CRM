"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitCpLeadAction, type SubmitCpLeadResult } from "./actions";

export function SubmitForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SubmitCpLeadResult | null>(null);

  return (
    <form
      className="space-y-4"
      action={(formData) =>
        start(async () => {
          setResult(null);
          const r = await submitCpLeadAction(formData);
          setResult(r);
          if (r.ok) {
            const form = document.querySelector("form");
            (form as HTMLFormElement | null)?.reset();
            router.refresh();
          }
        })
      }
    >
      <div className="space-y-1">
        <Label htmlFor="phone">Phone *</Label>
        <Input id="phone" name="phone" required minLength={7} maxLength={40} />
        {result &&
          !result.ok &&
          result.error === "validation" &&
          result.fieldErrors?.phone && (
            <p className="text-xs text-red-700">{result.fieldErrors.phone}</p>
          )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="source_property">Source property / project</Label>
        <Input
          id="source_property"
          name="source_property"
          placeholder="e.g. Skyline Towers, Phase 2"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="expected_budget">Expected budget</Label>
        <Input
          id="expected_budget"
          name="expected_budget"
          placeholder="e.g. ₹50L–₹70L"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit lead"}
        </Button>
        {result && result.ok && (
          <span className="text-xs text-emerald-700" role="status">
            Submitted · sent to CP coordinator
          </span>
        )}
        {result && !result.ok && (result.error !== "validation" || !result.fieldErrors?.phone) && (
          <span className="text-xs text-red-700" role="alert">
            {result.message ?? result.error}
          </span>
        )}
      </div>
    </form>
  );
}
