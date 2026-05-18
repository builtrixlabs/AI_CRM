"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitFeedbackAction } from "@/app/(dashboard)/dashboard/settings/feedback/actions";

const CATEGORIES = [
  { value: "bug", label: "Bug report" },
  { value: "idea", label: "Feature idea" },
  { value: "question", label: "Question" },
  { value: "other", label: "Other" },
];

export function FeedbackForm() {
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState("idea");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await submitFeedbackAction(category, message);
      if (r.ok) {
        setSent(true);
        setMessage("");
      } else {
        setError(r.message ?? r.reason);
      }
    });
  }

  if (sent) {
    return (
      <div
        className="rounded-md border border-border bg-card p-6 text-center"
        data-testid="feedback-sent"
      >
        <p className="text-sm font-medium">
          Thanks — your feedback was sent to the Builtrix team.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setSent(false)}
          data-testid="feedback-another"
        >
          Send more feedback
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="feedback-form">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Category
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="feedback-category"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Your feedback
        <textarea
          className="min-h-32 rounded-md border border-border bg-background p-2 text-sm text-foreground"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          data-testid="feedback-message"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={pending || message.trim().length < 3}
          onClick={submit}
          data-testid="feedback-submit"
        >
          Send feedback
        </Button>
        {error && (
          <p
            className="text-xs text-destructive"
            role="alert"
            data-testid="feedback-error"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
