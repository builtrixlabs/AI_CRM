"use client";

import { useState } from "react";
import Link from "next/link";
import type { CanvasDataV2 } from "@/lib/canvas/types";
import { TabStrip, type TabId } from "./tabs/tab-strip";
import { AiDraftsTab } from "./tabs/ai-drafts-tab";
import { UpdatesTab } from "./tabs/updates-tab";
import { ChatsTab } from "./tabs/chats-tab";
import { CallsTab } from "./tabs/calls-tab";
import { EmailsTab } from "./tabs/emails-tab";
import { CommentsTab } from "./tabs/comments-tab";
import { AppointmentsTab } from "./tabs/appointments-tab";
import { DocumentsTab } from "./tabs/documents-tab";
import { LeadLeftPane } from "./left-pane/lead-left-pane";
import { QuickActionButton } from "./quick-action/quick-action-button";

/**
 * v6.2.1 — split-pane lead canvas shell.
 *
 * Left pane (320 px fixed): lead fields, Voice IQ summary, action strip
 *   (LeadLeftPane — Step 8).
 *
 * Right pane (flex): TabStrip + active tab content.
 *   - AI Drafts (Step 5): inline approval, owner-scoped.
 *   - Updates / Chats / Calls / Emails / Comments / Appointments / Documents
 *     (Step 6): activity-stream-derived + dedicated row fetches.
 *   - Quick Action (Step 7): single modal that writes comment + status
 *     transition + follow-up atomically.
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
  canComment: boolean;
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
        <LeadLeftPane
          lead={data.lead}
          canCall={props.canCall}
          repPhone={props.repPhone}
        />
      </aside>

      <section
        className="flex flex-1 flex-col gap-3 p-4"
        data-testid="lead-canvas-v2-right-pane"
      >
        <header className="flex items-center justify-between gap-3">
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
          {props.canEdit && (
            <QuickActionButton
              leadId={data.lead.id}
              currentState={data.lead.state}
            />
          )}
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
          {active === "ai_drafts" && (
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
          )}
          {active === "updates" && (
            <UpdatesTab activities={data.activities} />
          )}
          {active === "chats" && <ChatsTab activities={data.activities} />}
          {active === "calls" && <CallsTab activities={data.activities} />}
          {active === "emails" && <EmailsTab activities={data.activities} />}
          {active === "comments" && (
            <CommentsTab
              leadId={data.lead.id}
              comments={data.comments}
              canComment={props.canComment}
            />
          )}
          {active === "appointments" && (
            <AppointmentsTab appointments={data.appointments} />
          )}
          {active === "documents" && (
            <DocumentsTab documents={data.documents} />
          )}
        </div>
      </section>
    </div>
  );
}
