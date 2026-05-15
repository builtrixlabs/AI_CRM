"use client";

import { useState } from "react";
import Link from "next/link";
import type { CanvasDataV2 } from "@/lib/canvas/types";
import { TabStrip, type TabId } from "./tabs/tab-strip";
import { AiDraftsTab } from "./tabs/ai-drafts-tab";

/**
 * v6.2.1 — split-pane lead canvas shell.
 *
 * Left pane (320 px fixed): lead fields, Voice IQ summary, action strip.
 *   - Placeholder in Step 4; fully populated in Step 8.
 *
 * Right pane (flex): TabStrip + active tab content.
 *   - AI Drafts tab content lands in Step 5.
 *   - Updates / Chats / Calls / Emails / Comments / Appointments / Documents
 *     tabs land in Step 6.
 *   - In Step 4 (this commit), each tab renders a placeholder that confirms
 *     the routing works end-to-end.
 */

export type LeadCanvasV2Props = {
  data: CanvasDataV2;
  /** True when the viewing user can approve drafts on this lead — either via
   *  a global perm (manager+ / org_admin) or owner-scoped (sales rep on their
   *  own lead). Drives the approve/reject button state on the AI Drafts tab. */
  canApproveDraft: boolean;
  /** True when the user has agents:view_activity or agents:approve_T2 — used
   *  by the AI Drafts tab to skip the owner check entirely. */
  canApproveAnyInOrg: boolean;
  /** True when this user is the assigned sales rep on this lead. Used to
   *  toggle owner-only affordances (the Quick Action modal). */
  isOwner: boolean;
  canEdit: boolean;
  canCall: boolean;
  canPromoteToDeal: boolean;
  /** The viewing user's phone, surfaced on click-to-call buttons. */
  repPhone: string | null;
};

export function LeadCanvasV2(props: LeadCanvasV2Props) {
  const { data } = props;
  const [active, setActive] = useState<TabId>(
    data.tab_counts.ai_drafts > 0 ? "ai_drafts" : "updates",
  );

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] gap-0"
      data-testid="lead-canvas-v2"
    >
      <aside
        className="w-80 shrink-0 border-r border-neutral-200 bg-neutral-50 p-4"
        data-testid="lead-canvas-v2-left-pane"
      >
        <LeftPanePlaceholder data={data} />
      </aside>

      <section
        className="flex flex-1 flex-col gap-3 p-4"
        data-testid="lead-canvas-v2-right-pane"
      >
        <header className="flex items-center justify-between">
          <div>
            <Link
              href="/dashboard/leads"
              className="text-xs text-neutral-500 hover:underline"
            >
              ← Back to Leads
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">
              {data.lead.label}
            </h1>
          </div>
        </header>

        <TabStrip
          active={active}
          counts={data.tab_counts}
          onChange={setActive}
        />

        <div
          role="tabpanel"
          aria-labelledby={`lead-canvas-tab-${active}`}
          data-testid={`lead-canvas-tabpanel-${active}`}
          className="flex-1"
        >
          {active === "ai_drafts" ? (
            <AiDraftsTab
              leadId={data.lead.id}
              drafts={data.pending_drafts}
              canApprove={props.canApproveDraft}
              disabledReason={
                props.canApproveDraft
                  ? undefined
                  : props.canApproveAnyInOrg
                    ? undefined
                    : "Only the assigned rep (or a manager) can approve this draft."
              }
            />
          ) : (
            <TabPlaceholder active={active} />
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Step 4 placeholder — confirms the shell + routing work. Replaced by real
 * left-pane content in Step 8 (lead fields + Voice IQ summary + action strip).
 */
function LeftPanePlaceholder({ data }: { data: CanvasDataV2 }) {
  const ldata = data.lead.data as Record<string, unknown>;
  const status = data.lead.state;
  const phone =
    typeof ldata.phone === "string"
      ? ldata.phone
      : typeof (ldata.contact as Record<string, unknown> | undefined)?.phone === "string"
        ? ((ldata.contact as Record<string, unknown>).phone as string)
        : null;
  const email =
    typeof ldata.email === "string"
      ? ldata.email
      : typeof (ldata.contact as Record<string, unknown> | undefined)?.email === "string"
        ? ((ldata.contact as Record<string, unknown>).email as string)
        : null;

  return (
    <div className="space-y-3" data-testid="lead-canvas-v2-left-fields">
      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500">Status</p>
        <p className="text-sm font-medium text-neutral-900">{status}</p>
      </div>
      {phone && (
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Phone
          </p>
          <p className="text-sm text-neutral-900">{phone}</p>
        </div>
      )}
      {email && (
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Email
          </p>
          <p className="text-sm text-neutral-900">{email}</p>
        </div>
      )}
      <p
        className="rounded border border-dashed border-neutral-300 p-2 text-xs text-neutral-500"
        data-testid="lead-canvas-v2-left-pane-placeholder"
      >
        Voice IQ summary, full lead-fields editor, and action strip land here
        in Step 8.
      </p>
    </div>
  );
}

/**
 * Step 4 placeholder — each tab announces its presence so the shell can be
 * verified independently of tab content. AI Drafts is wired in Step 5; the
 * remaining 7 tabs land in Step 6.
 */
function TabPlaceholder({ active }: { active: TabId }) {
  const labels: Record<TabId, string> = {
    updates: "Activity stream (Updates) — lands in Step 6.",
    ai_drafts: "AI Drafts approval inline — lands in Step 5.",
    chats: "WhatsApp / SMS conversation thread — lands in Step 6.",
    calls: "Call log with playback — lands in Step 6.",
    emails: "Email conversation thread — lands in Step 6.",
    comments: "Internal comment thread — lands in Step 6.",
    appointments: "Scheduled & past site visits — lands in Step 6.",
    documents: "Sent brochures + uploaded documents — lands in Step 6.",
  };
  return (
    <div
      className="rounded border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
      data-testid={`lead-canvas-v2-${active}-placeholder`}
    >
      {labels[active]}
    </div>
  );
}
