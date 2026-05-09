"use client";
import { useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { leadSchema } from "@/lib/nodes/schemas/lead";
import type { CanvasActivity, CanvasLead } from "@/lib/canvas/types";
import type { LeadState } from "@/lib/leads/types";
import { CanvasSection } from "./canvas-section";
import { CanvasHeader } from "./canvas-header";
import { FieldBlock } from "./field-block";
import { ActivityStream } from "./activity-stream";
import { SuggestedActionSlot } from "./suggested-action-slot";
import { AgentPanelSlot } from "./agent-panel-slot";
import { SchemaMismatch } from "./schema-mismatch";
import { EditModeButton } from "./edit-mode-button";
import { EditLeadForm } from "./edit-lead-form";
import { TransitionFooter } from "./transition-footer";

type Props = {
  lead: CanvasLead;
  initialActivities: CanvasActivity[];
  /** When true, disables Realtime subscription (demo route). */
  demo?: boolean;
  /** When true, renders the EditMode toggle + edit form on click. */
  canEdit?: boolean;
  /** When true, renders the TransitionFooter with state-machine buttons. */
  canTransition?: boolean;
  suggestedAction?: ReactNode;
  agentActivity?: ReactNode;
  /**
   * D-020 — server-rendered custom fields block. Passed in by the page
   * (Server Component) so this Client Component doesn't need to await
   * `listFieldsForType`.
   */
  customFields?: ReactNode;
};

/**
 * The Lead Canvas. Sections rendered in order (no tabs, Constitution IX):
 * Header → FieldBlock (More expander) → ActivityStream → SuggestedAction
 * → AgentPanel → TransitionFooter (when canTransition).
 *
 * canEdit toggles the EditModeButton in the Header; clicking it swaps the
 * Header + FieldBlock for an EditLeadForm. demo route preserves D-006's
 * read-only behavior because canEdit/canTransition default to false.
 */
export function LeadCanvas(props: Props) {
  const {
    lead,
    initialActivities,
    demo = false,
    canEdit = false,
    canTransition = false,
    suggestedAction,
    agentActivity,
    customFields,
  } = props;
  const [editing, setEditing] = useState(false);
  const leadValid = leadSchema.safeParse(lead.data).success;

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-testid="lead-canvas"
        data-demo={demo}
        data-editing={editing}
        className="mx-auto max-w-3xl space-y-6 p-8"
      >
        {demo ? (
          <div
            data-testid="demo-banner"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            Demo lead — fictional data, no DB row.
          </div>
        ) : null}
        {editing && leadValid ? (
          <CanvasSection delay={0} testId="section-edit">
            <EditLeadForm
              lead={lead}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </CanvasSection>
        ) : (
          <>
            <CanvasSection delay={0} testId="section-header">
              <div className="flex items-start justify-between gap-4">
                <CanvasHeader lead={lead} />
                {canEdit && leadValid ? (
                  <EditModeButton
                    editing={editing}
                    onToggle={() => setEditing((v) => !v)}
                  />
                ) : null}
              </div>
            </CanvasSection>
            {leadValid ? (
              <CanvasSection delay={0.05} testId="section-fields">
                <FieldBlock lead={lead} />
                {customFields}
              </CanvasSection>
            ) : (
              <CanvasSection delay={0.05} testId="section-schema-mismatch">
                <SchemaMismatch recordId={lead.id} />
              </CanvasSection>
            )}
          </>
        )}
        <CanvasSection delay={0.1} testId="section-activity">
          <ActivityStream
            lead_id={lead.id}
            initial={initialActivities}
            currentOrgId={lead.organization_id}
            currentWorkspaceId={lead.workspace_id}
            paused={demo}
          />
        </CanvasSection>
        <CanvasSection delay={0.15} testId="section-suggested">
          <SuggestedActionSlot>{suggestedAction}</SuggestedActionSlot>
        </CanvasSection>
        <CanvasSection delay={0.2} testId="section-agent">
          <AgentPanelSlot>{agentActivity}</AgentPanelSlot>
        </CanvasSection>
        {canTransition ? (
          <CanvasSection delay={0.25} testId="section-transition">
            <TransitionFooter
              lead_id={lead.id}
              current_state={lead.state as LeadState}
            />
          </CanvasSection>
        ) : null}
      </div>
    </MotionConfig>
  );
}
