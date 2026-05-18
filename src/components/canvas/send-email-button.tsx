"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  leadId: string;
  leadEmail: string | null;
};

function messageForError(error?: string): string {
  switch (error) {
    case "no_lead_email":
      return "This lead has no email on file. Add one and retry.";
    case "missing_subject":
      return "Subject is required.";
    case "missing_body":
      return "Message body is required.";
    case "not_configured":
      return "Email isn't configured for your org. An admin can set it up at /admin/integrations.";
    case "forbidden":
      return "You don't have permission to send messages.";
    case "lead_not_found":
      return "Lead not found.";
    default:
      return "Email could not be sent. Please try again.";
  }
}

/**
 * v6.2.2 — quick-send email control on the lead workspace rail.
 * POSTs to /api/leads/[id]/send-email; on success, refreshes the page so
 * the new `email.sent` activity node appears in the stream.
 */
export function SendEmailButton({ leadId, leadEmail }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [pending, startTransition] = useTransition();
  const [isError, setIsError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !leadEmail;

  function reset() {
    setSubject("");
    setBodyText("");
    setIsError(false);
    setMessage(null);
  }

  function submit() {
    setIsError(false);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/leads/${encodeURIComponent(leadId)}/send-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, body_text: bodyText }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setIsError(true);
          setMessage(messageForError(json.error));
          return;
        }
        setMessage("Email sent. It will appear in the activity stream.");
        setSubject("");
        setBodyText("");
        router.refresh();
        // Auto-close after a short beat so the operator sees the confirm.
        setTimeout(() => setOpen(false), 1200);
      } catch {
        setIsError(true);
        setMessage("Could not reach the send service. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <button
        type="button"
        className="bcmd-icon-btn h-9 w-full justify-start gap-2 px-3 text-[12px] font-display font-semibold"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "No email on this lead" : "Send email"}
        data-testid="send-email-btn"
      >
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        Send email
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            {leadEmail
              ? `Recipient: ${leadEmail}`
              : "This lead has no email on file."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-email-subject">Subject</Label>
            <Input
              id="send-email-subject"
              data-testid="send-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Following up on your inquiry"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-email-body">Message</Label>
            <Textarea
              id="send-email-body"
              data-testid="send-email-body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={8}
              placeholder="Hi there, …"
            />
          </div>
          {message && (
            <p
              className={`font-sans text-[12px] ${isError ? "text-red-600" : "text-[var(--copper-700)]"}`}
              role={isError ? "alert" : undefined}
              data-testid="send-email-message"
            >
              {message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !subject.trim() || !bodyText.trim() || disabled}
            data-testid="send-email-submit"
          >
            {pending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
