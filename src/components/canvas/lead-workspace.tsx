"use client";

import { useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { leadSchema } from "@/lib/nodes/schemas/lead";
import type { CanvasActivity, CanvasLead } from "@/lib/canvas/types";
import type { LeadState } from "@/lib/leads/types";
import { ActivityStream } from "./activity-stream";
import { SuggestedActionSlot } from "./suggested-action-slot";
import { AgentPanelSlot } from "./agent-panel-slot";
import { SchemaMismatch } from "./schema-mismatch";
import { EditLeadForm } from "./edit-lead-form";
import { TransitionFooter } from "./transition-footer";
import { ClickToCallButton } from "./click-to-call-button";
import { PromoteToDealButton } from "./promote-to-deal-button";
import { EditModeButton } from "./edit-mode-button";
import { ScheduleSiteVisitButton } from "./schedule-site-visit-button";
import { LeadProfileRail } from "./lead-profile-rail";

type Props = {
  lead: CanvasLead;
  initialActivities: CanvasActivity[];
  /** Disables realtime + edit/transition (demo route). */
  demo?: boolean;
  canEdit?: boolean;
  canTransition?: boolean;
  canCall?: boolean;
  canPromoteToDeal?: boolean;
  canScheduleVisit?: boolean;
  repPhone?: string | null;
  ownerName?: string | null;
  ownerRole?: string | null;
  suggestedAction?: ReactNode;
  agentActivity?: ReactNode;
  /** D-020 — server-rendered custom fields block. */
  customFields?: ReactNode;
};

/**
 * v6.2.2 — 2-pane Builtrix Command lead workspace. Replaces the prior
 * single-column LeadCanvas on /dashboard/leads/[id].
 *
 * Layout:
 *   - Top header band: eyebrow + lead name + action bar (Edit, Promote,
 *     Call, Schedule visit). All actions are gated by the perm props the
 *     server-component page resolved.
 *   - LEFT rail (320px sticky on lg+): identity, contact, source, owner,
 *     timestamps. Always-rendered so sparse leads don't read as broken.
 *   - MAIN column: activity stream + suggested action + agent panel +
 *     transition footer. Existing widgets reused as-is.
 *
 * Edit mode (toggled via EditModeButton) swaps the main column for the
 * EditLeadForm; the rail stays mounted as context.
 *
 * Constitution IX is preserved: no tabs, same route, all content visible.
 */
export function LeadWorkspace(props: Props) {
  const {
    lead,
    initialActivities,
    demo = false,
    canEdit = false,
    canTransition = false,
    canCall = false,
    canPromoteToDeal = false,
    canScheduleVisit = true,
    repPhone = null,
    ownerName = null,
    ownerRole = null,
    suggestedAction,
    agentActivity,
    customFields,
  } = props;
  const [editing, setEditing] = useState(false);
  const leadValid = leadSchema.safeParse(lead.data).success;
  const data = lead.data as Record<string, unknown>;
  const leadHasPhone = typeof data.phone === "string" && data.phone.trim() !== "";
  const displayName =
    pickString(data, "name") ?? pickString(data, "full_name") ?? lead.label;

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-testid="lead-workspace"
        data-demo={demo}
        data-editing={editing}
        className="mx-auto max-w-[1280px] px-6 py-6"
      >
        {demo ? (
          <div
            data-testid="demo-banner"
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 font-sans text-sm text-amber-900"
          >
            Demo lead — fictional data, no DB row.
          </div>
        ) : null}

        {/* Header band */}
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="bcmd-page-eyebrow">
              Lead · {ownerName ? `Owned by ${ownerName}` : "Unassigned"}
            </div>
            <h1 className="bcmd-page-title truncate" title={displayName}>
              {displayName}
            </h1>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="lead-actions-bar"
          >
            {canEdit && leadValid && !demo ? (
              <EditModeButton
                editing={editing}
                onToggle={() => setEditing((v) => !v)}
              />
            ) : null}
            {canPromoteToDeal && !demo ? (
              <PromoteToDealButton leadId={lead.id} />
            ) : null}
            {canScheduleVisit && !demo ? (
              <ScheduleSiteVisitButton leadId={lead.id} />
            ) : null}
          </div>
        </header>

        {/* 2-pane workspace */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left rail — sticky on lg+ */}
          <div className="lg:sticky lg:top-[88px] lg:self-start space-y-4">
            <LeadProfileRail
              lead={lead}
              ownerName={ownerName}
              ownerRole={ownerRole}
            />
            {canCall ? (
              <section
                className="bcmd-card p-4 space-y-2"
                data-testid="lead-call-card"
              >
                <h3 className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--amethyst-700)]">
                  Click to call
                </h3>
                <ClickToCallButton
                  leadId={lead.id}
                  leadHasPhone={leadHasPhone}
                  repPhone={repPhone}
                />
              </section>
            ) : null}
            {customFields ? (
              <section
                className="bcmd-card p-4"
                data-testid="lead-custom-fields-card"
              >
                <h3 className="mb-2 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--amethyst-700)]">
                  Custom fields
                </h3>
                {customFields}
              </section>
            ) : null}
          </div>

          {/* Main column */}
          <div className="min-w-0 space-y-5">
            {editing && leadValid && !demo ? (
              <section
                className="bcmd-card p-6"
                data-testid="lead-edit-section"
              >
                <EditLeadForm
                  lead={lead}
                  onSaved={() => setEditing(false)}
                  onCancel={() => setEditing(false)}
                />
              </section>
            ) : (
              <>
                {!leadValid ? (
                  <section
                    className="bcmd-card p-6"
                    data-testid="lead-schema-mismatch-section"
                  >
                    <SchemaMismatch recordId={lead.id} />
                  </section>
                ) : null}
                <WorkspacePanel
                  title="Activity stream"
                  subtitle="Calls, messages, system events · live"
                  testId="lead-activity-section"
                >
                  <ActivityStream
                    lead_id={lead.id}
                    initial={initialActivities}
                    currentOrgId={lead.organization_id}
                    currentWorkspaceId={lead.workspace_id}
                    paused={demo}
                  />
                </WorkspacePanel>
                <WorkspacePanel
                  title="Suggested next action"
                  subtitle="What the AI thinks you should do next"
                  testId="lead-suggested-section"
                >
                  <SuggestedActionSlot>{suggestedAction}</SuggestedActionSlot>
                </WorkspacePanel>
                <WorkspacePanel
                  title="Agent activity"
                  subtitle="Autonomous agents working this lead"
                  testId="lead-agent-section"
                >
                  <AgentPanelSlot>{agentActivity}</AgentPanelSlot>
                </WorkspacePanel>
                {canTransition && !demo ? (
                  <WorkspacePanel
                    title="Pipeline transitions"
                    subtitle="Move this lead through the funnel"
                    testId="lead-transition-section"
                  >
                    <TransitionFooter
                      lead_id={lead.id}
                      current_state={lead.state as LeadState}
                    />
                  </WorkspacePanel>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

function WorkspacePanel({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="bcmd-card" data-testid={testId}>
      <header className="bcmd-section-header">
        <div>
          <h3 className="bcmd-section-title">{title}</h3>
          {subtitle ? (
            <p className="bcmd-section-subtitle">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function pickString(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = data[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}
