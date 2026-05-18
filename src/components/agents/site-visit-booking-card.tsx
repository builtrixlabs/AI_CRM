"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { submitSiteVisitBookingAction } from "@/app/(admin)/admin/agents/queue/actions";

/** Wire-compatible with the admin SiteVisitBookingActionResult and the
 *  v6.2.1 owner-scoped equivalent. */
export type SiteVisitBookingResult =
  | { ok: true; dispatch: "sent" | "deferred"; assigned: boolean }
  | { ok: false; error: string; message?: string };

type FormState = {
  scheduled_at: string;
  pickup_address: string;
  pickup_time: string;
  cab_provider: string;
  cab_booking_ref: string;
  driver_name: string;
  driver_phone: string;
  vehicle_number: string;
};

const EMPTY: FormState = {
  scheduled_at: "",
  pickup_address: "",
  pickup_time: "",
  cab_provider: "",
  cab_booking_ref: "",
  driver_name: "",
  driver_phone: "",
  vehicle_number: "",
};

/** `<input type="datetime-local">` value → ISO 8601, or null if blank/invalid. */
function toIso(local: string): string | null {
  if (!local) return null;
  const t = Date.parse(local);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const inputCls = "h-8 w-full rounded border border-neutral-300 px-2 text-sm";

/**
 * D-601 — the `site_visit_booking` approval-queue action card. The
 * operator enters the cab details; submit transitions the draft visit to
 * scheduled, auto-assigns the project's sales rep, and dispatches the
 * customer WhatsApp confirmation.
 *
 * v6.2.1 — `onSubmit` is now injectable so the same card serves both
 *   - /admin/agents/queue  (default: org-admin gated submitSiteVisitBookingAction)
 *   - lead canvas AI Drafts tab (owner-scoped action)
 * `canSubmit=false` renders all inputs + the submit button disabled
 * (used when a non-owner views the draft).
 */
export type SiteVisitBookingCardProps = {
  queueId: string;
  leadId: string;
  leadLabel: string;
  onSubmit?: (queueId: string, cab: unknown) => Promise<SiteVisitBookingResult>;
  canSubmit?: boolean;
  disabledReason?: string;
};

export function SiteVisitBookingCard({
  queueId,
  leadId,
  leadLabel,
  onSubmit,
  canSubmit = true,
  disabledReason,
}: SiteVisitBookingCardProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<
    null | { dispatch: "sent" | "deferred"; assigned: boolean }
  >(null);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function submit() {
    setError(null);
    const scheduled_at = toIso(form.scheduled_at);
    const pickup_time = toIso(form.pickup_time);
    if (!scheduled_at) {
      setError("Enter the visit date & time.");
      return;
    }
    if (!pickup_time) {
      setError("Enter the cab pickup time.");
      return;
    }
    if (!form.pickup_address.trim()) {
      setError("Enter the pickup address.");
      return;
    }
    if (!form.cab_provider.trim()) {
      setError("Enter the cab provider.");
      return;
    }
    if (!form.driver_name.trim()) {
      setError("Enter the driver's name.");
      return;
    }
    if (!form.driver_phone.trim()) {
      setError("Enter the driver's phone number.");
      return;
    }
    if (!form.vehicle_number.trim()) {
      setError("Enter the vehicle number.");
      return;
    }

    const cab = {
      scheduled_at,
      pickup_time,
      pickup_address: form.pickup_address.trim(),
      cab_provider: form.cab_provider.trim(),
      ...(form.cab_booking_ref.trim()
        ? { cab_booking_ref: form.cab_booking_ref.trim() }
        : {}),
      driver_name: form.driver_name.trim(),
      driver_phone: form.driver_phone.trim(),
      vehicle_number: form.vehicle_number.trim(),
    };

    const submitFn = onSubmit ?? submitSiteVisitBookingAction;

    startTransition(async () => {
      const r = await submitFn(queueId, cab);
      if (!r.ok) {
        setError(r.message ?? r.error);
        return;
      }
      setDone({ dispatch: r.dispatch, assigned: r.assigned });
    });
  }

  if (done) {
    return (
      <div
        className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
        data-testid={`site-visit-booking-done-${queueId}`}
      >
        Site visit scheduled.{" "}
        {done.assigned
          ? "Sales rep auto-assigned."
          : "No project rep mapped — a coordinator must assign one."}{" "}
        {done.dispatch === "sent"
          ? "Customer notified on WhatsApp."
          : "WhatsApp integration not configured — the confirmation is deferred."}
      </div>
    );
  }

  return (
    <div
      className="rounded border border-neutral-200 bg-white p-4 space-y-3"
      data-testid={`site-visit-booking-card-${queueId}`}
    >
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href={`/dashboard/leads/${leadId}`}
          className="font-medium text-blue-700 hover:underline"
        >
          {leadLabel}
        </Link>
        <span className="text-neutral-300">·</span>
        <span className="uppercase">book site visit</span>
      </div>
      <p className="text-sm text-neutral-600">
        Enter the cab details to confirm the visit and notify the customer.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Visit date &amp; time
          <input
            type="datetime-local"
            className={inputCls}
            value={form.scheduled_at}
            onChange={(e) => patch({ scheduled_at: e.target.value })}
            data-testid="site-visit-scheduled-at"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Cab pickup time
          <input
            type="datetime-local"
            className={inputCls}
            value={form.pickup_time}
            onChange={(e) => patch({ pickup_time: e.target.value })}
            data-testid="site-visit-pickup-time"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-600">
          Pickup address
          <input
            className={inputCls}
            value={form.pickup_address}
            onChange={(e) => patch({ pickup_address: e.target.value })}
            data-testid="site-visit-pickup-address"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Cab provider
          <input
            className={inputCls}
            value={form.cab_provider}
            onChange={(e) => patch({ cab_provider: e.target.value })}
            data-testid="site-visit-cab-provider"
            placeholder="e.g. Ola, local fleet"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Booking ref (optional)
          <input
            className={inputCls}
            value={form.cab_booking_ref}
            onChange={(e) => patch({ cab_booking_ref: e.target.value })}
            data-testid="site-visit-cab-booking-ref"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Driver name
          <input
            className={inputCls}
            value={form.driver_name}
            onChange={(e) => patch({ driver_name: e.target.value })}
            data-testid="site-visit-driver-name"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Driver phone
          <input
            className={inputCls}
            value={form.driver_phone}
            onChange={(e) => patch({ driver_phone: e.target.value })}
            data-testid="site-visit-driver-phone"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Vehicle number
          <input
            className={inputCls}
            value={form.vehicle_number}
            onChange={(e) => patch({ vehicle_number: e.target.value })}
            data-testid="site-visit-vehicle-number"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={pending || !canSubmit}
          onClick={submit}
          title={!canSubmit ? (disabledReason ?? undefined) : undefined}
          data-testid={`site-visit-booking-submit-${queueId}`}
        >
          {pending ? "Booking…" : "Confirm booking"}
        </Button>
        {!canSubmit && disabledReason && (
          <p
            className="text-xs text-neutral-500"
            data-testid={`site-visit-booking-disabled-${queueId}`}
          >
            {disabledReason}
          </p>
        )}
        {error && (
          <p
            className="text-xs text-red-600"
            role="alert"
            data-testid={`site-visit-booking-error-${queueId}`}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
