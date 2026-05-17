"use client";

import Link from "next/link";
import type { CanvasAppointment } from "@/lib/canvas/types";

/**
 * v6.2.1 — Appointments tab: scheduled + past site visits for this lead.
 *
 * Rows come from getLeadCanvasV2's site_visit fetch (jsonb-filtered by
 * data.lead_id). Each row links to the existing site_visit detail page
 * shipped in D-602 / D-601.
 */
export type AppointmentsTabProps = {
  appointments: CanvasAppointment[];
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function stateBadge(state: string): string {
  switch (state) {
    case "scheduled":
    case "confirmed":
      return "bg-emerald-100 text-emerald-800";
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-neutral-200 text-neutral-700";
    case "cancelled":
    case "no_show":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

export function AppointmentsTab({ appointments }: AppointmentsTabProps) {
  if (appointments.length === 0) {
    return (
      <div
        className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
        data-testid="appointments-tab-empty"
      >
        No site visits scheduled. The Site Visit Agent drops booking
        suggestions on the AI Drafts tab; approving one creates the
        appointment.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="appointments-tab">
      {appointments.map((v) => (
        <li
          key={v.id}
          data-testid={`appointment-row-${v.id}`}
          className="rounded border border-neutral-200 bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/dashboard/site-visits/${v.id}`}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              {v.label}
            </Link>
            <span
              className={
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                stateBadge(v.state)
              }
              data-testid={`appointment-row-${v.id}-state`}
            >
              {v.state.replace(/_/g, " ")}
            </span>
          </div>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-neutral-600">
            <dt className="text-neutral-500">When</dt>
            <dd>{fmt(v.scheduled_at)}</dd>
            {v.pickup_address && (
              <>
                <dt className="text-neutral-500">Pickup</dt>
                <dd>{v.pickup_address}</dd>
              </>
            )}
            {v.cab_provider && (
              <>
                <dt className="text-neutral-500">Cab</dt>
                <dd>{v.cab_provider}</dd>
              </>
            )}
          </dl>
        </li>
      ))}
    </ul>
  );
}
