"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";

type Props = {
  leadId: string;
  disabled?: boolean;
};

/**
 * Routes to the Site Visits list with the lead pre-selected, so the
 * coordinator can spin up a visit against this lead. A first-class
 * in-page booking dialog is the right next step (own directive) — this
 * is the working stop-gap so the button is interactive, not dead.
 */
export function ScheduleSiteVisitButton({ leadId, disabled = false }: Props) {
  if (disabled) {
    return (
      <button
        type="button"
        className="bcmd-icon-btn h-9 w-auto px-3 text-[12px] font-display font-semibold opacity-60 cursor-not-allowed"
        disabled
        data-testid="schedule-visit-btn-disabled"
      >
        <Calendar className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Schedule visit
      </button>
    );
  }
  return (
    <Link
      href={`/dashboard/site-visits?lead=${encodeURIComponent(leadId)}`}
      className="bcmd-icon-btn h-9 w-auto px-3 text-[12px] font-display font-semibold gap-1.5"
      data-testid="schedule-visit-btn"
    >
      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
      Schedule visit
    </Link>
  );
}
