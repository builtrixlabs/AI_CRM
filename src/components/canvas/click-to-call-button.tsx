"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  leadId: string;
  /** Whether the lead has a phone number to call. */
  leadHasPhone: boolean;
  /** The rep's own phone (profiles.phone) — null prompts a Settings nudge. */
  repPhone: string | null;
};

function messageForError(error?: string): string {
  switch (error) {
    case "no_rep_phone":
      return "Add your phone number in Settings before placing a call.";
    case "no_lead_phone":
      return "This lead has no phone number.";
    case "not_configured":
      return "Your org's telephony integration isn't configured yet — an org admin can set it up at /admin/integrations.";
    case "forbidden":
      return "You don't have permission to place calls.";
    case "lead_not_found":
      return "Lead not found.";
    default:
      return "The call could not be placed. Please try again.";
  }
}

/**
 * D-609 — click-to-call control on the lead canvas. POSTs to
 * /api/calls/initiate; the server resolves the lead's phone, places the
 * Exotel-bridged call, and writes a `call.initiated` activity node that
 * the activity stream picks up via realtime.
 *
 * Rendered by LeadCanvas only when the caller holds `calls:listen`.
 */
export function ClickToCallButton({ leadId, leadHasPhone, repPhone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isError, setIsError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!repPhone || !repPhone.trim()) {
    return (
      <p
        className="text-xs text-neutral-500"
        data-testid="click-to-call-no-phone"
      >
        Add your phone number in{" "}
        <a href="/dashboard/settings" className="underline">
          Settings
        </a>{" "}
        to enable click-to-call.
      </p>
    );
  }

  function call() {
    setIsError(false);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/calls/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: leadId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setIsError(true);
          setMessage(messageForError(data.error));
          return;
        }
        setMessage(
          "Calling — both phones will ring. The call will appear in the activity stream.",
        );
        router.refresh();
      } catch {
        setIsError(true);
        setMessage("Could not reach the calling service. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1" data-testid="click-to-call">
      <Button
        type="button"
        size="sm"
        disabled={pending || !leadHasPhone}
        onClick={call}
        data-testid="click-to-call-btn"
      >
        {pending ? "Calling…" : "Call"}
      </Button>
      {!leadHasPhone && (
        <p className="text-xs text-neutral-500">
          No phone number on this lead.
        </p>
      )}
      {message && (
        <p
          className={`text-xs ${isError ? "text-red-600" : "text-neutral-500"}`}
          role={isError ? "alert" : undefined}
          data-testid="click-to-call-message"
        >
          {message}
        </p>
      )}
    </div>
  );
}
