"use client";

import Link from "next/link";
import type { CanvasLead } from "@/lib/canvas/types";
import { ClickToCallButton } from "@/components/canvas/click-to-call-button";

/**
 * v6.2.1 — left pane of the split-pane lead canvas.
 *
 * Three stacked sections:
 *   1. Status + identity (label, status badge)
 *   2. Lead fields (phone, email, source, project, budget, BHK, follow-up)
 *   3. Voice IQ summary (intent score + BANT signals, when present in
 *      lead.data.voice_iq)
 *   4. Action strip — Call / WhatsApp / Email
 *
 * Layout is fixed-width (320px) on the parent <aside>; this component is
 * purely the inside-the-pane vertical stack.
 */

export type LeadLeftPaneProps = {
  lead: CanvasLead;
  canCall: boolean;
  repPhone: string | null;
};

type VoiceIqSnapshot = {
  intent_score?: number;
  budget?: boolean | "yes" | "no" | null;
  authority?: boolean | "yes" | "no" | null;
  need?: boolean | "yes" | "no" | null;
  timeline?: string | null;
  next_best_action?: string | null;
};

function strField(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function nestedStr(
  data: Record<string, unknown>,
  outerKey: string,
  innerKey: string,
): string | null {
  const outer = data[outerKey];
  if (!outer || typeof outer !== "object") return null;
  const v = (outer as Record<string, unknown>)[innerKey];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function voiceIqOf(data: Record<string, unknown>): VoiceIqSnapshot | null {
  const v = data.voice_iq;
  if (!v || typeof v !== "object") return null;
  return v as VoiceIqSnapshot;
}

function bantPill(value: VoiceIqSnapshot["budget"]): string {
  if (value === true || value === "yes") return "✓";
  if (value === false || value === "no") return "✗";
  return "—";
}

function bantClass(value: VoiceIqSnapshot["budget"]): string {
  if (value === true || value === "yes")
    return "text-emerald-700 font-semibold";
  if (value === false || value === "no") return "text-rose-700 font-semibold";
  return "text-neutral-400";
}

export function LeadLeftPane({
  lead,
  canCall,
  repPhone,
}: LeadLeftPaneProps) {
  const data = lead.data as unknown as Record<string, unknown>;
  const phone =
    strField(data, "phone") ?? nestedStr(data, "contact", "phone");
  const email =
    strField(data, "email") ?? nestedStr(data, "contact", "email");
  const source = strField(data, "source");
  const project =
    strField(data, "project_name") ?? nestedStr(data, "preference", "project");
  const bhk =
    typeof data.bhk === "number"
      ? `${data.bhk} BHK`
      : nestedStr(data, "preference", "bhk");
  const budget =
    strField(data, "budget") ??
    strField(data, "budget_band") ??
    nestedStr(data, "preference", "budget_band");
  const followUp = strField(data, "follow_up_on");
  const viq = voiceIqOf(data);

  return (
    <div className="space-y-4" data-testid="lead-canvas-v2-left-fields">
      <section>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Status
        </p>
        <p
          className="text-sm font-semibold text-neutral-900"
          data-testid="left-pane-status"
        >
          {lead.state.replace(/_/g, " ")}
        </p>
      </section>

      <section className="space-y-1.5">
        <Row label="Name" value={lead.label} testId="left-pane-name" />
        {phone && (
          <Row label="Phone" value={phone} testId="left-pane-phone" />
        )}
        {email && (
          <Row label="Email" value={email} testId="left-pane-email" />
        )}
        {source && (
          <Row label="Source" value={source} testId="left-pane-source" />
        )}
        {project && (
          <Row label="Project" value={project} testId="left-pane-project" />
        )}
        {bhk && <Row label="BHK" value={bhk} testId="left-pane-bhk" />}
        {budget && (
          <Row label="Budget" value={budget} testId="left-pane-budget" />
        )}
        {followUp && (
          <Row
            label="Follow-up"
            value={fmtDate(followUp)}
            testId="left-pane-follow-up"
          />
        )}
      </section>

      {viq && (
        <section
          className="rounded border border-violet-200 bg-violet-50 p-2"
          data-testid="left-pane-voice-iq"
        >
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-violet-800">
            Voice IQ
          </p>
          {typeof viq.intent_score === "number" && (
            <p className="text-xs text-violet-900">
              Intent:{" "}
              <span
                className="font-semibold"
                data-testid="left-pane-voice-iq-intent"
              >
                {viq.intent_score}
              </span>
            </p>
          )}
          <dl className="mt-1 grid grid-cols-2 gap-y-0.5 text-xs">
            <dt className="text-neutral-600">Budget</dt>
            <dd className={bantClass(viq.budget)}>{bantPill(viq.budget)}</dd>
            <dt className="text-neutral-600">Authority</dt>
            <dd className={bantClass(viq.authority)}>
              {bantPill(viq.authority)}
            </dd>
            <dt className="text-neutral-600">Need</dt>
            <dd className={bantClass(viq.need)}>{bantPill(viq.need)}</dd>
            {viq.timeline && (
              <>
                <dt className="text-neutral-600">Timeline</dt>
                <dd className="text-neutral-900">{viq.timeline}</dd>
              </>
            )}
          </dl>
          {viq.next_best_action && (
            <p
              className="mt-1.5 rounded border border-violet-300 bg-white px-1.5 py-1 text-xs"
              data-testid="left-pane-voice-iq-nba"
            >
              NBA: {viq.next_best_action}
            </p>
          )}
        </section>
      )}

      <section
        className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3"
        data-testid="left-pane-action-strip"
      >
        {canCall && (
          <ClickToCallButton
            leadId={lead.id}
            leadHasPhone={!!phone}
            repPhone={repPhone}
          />
        )}
        {phone && (
          <a
            href={`https://wa.me/${phone.replace(/[^0-9+]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
            data-testid="left-pane-whatsapp"
          >
            WhatsApp
          </a>
        )}
        {email && (
          <Link
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
            data-testid="left-pane-email-btn"
          >
            Email
          </Link>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd
        className="min-w-0 flex-1 truncate text-sm text-neutral-900"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
