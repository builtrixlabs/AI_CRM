"use client";
import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { leadSchema } from "@/lib/nodes/schemas/lead";
import type { CanvasActivity, CanvasLead } from "@/lib/canvas/types";
import { CanvasSection } from "./canvas-section";
import { CanvasHeader } from "./canvas-header";
import { FieldBlock } from "./field-block";
import { ActivityStream } from "./activity-stream";
import { SuggestedActionSlot } from "./suggested-action-slot";
import { AgentPanelSlot } from "./agent-panel-slot";
import { SchemaMismatch } from "./schema-mismatch";

type Props = {
  lead: CanvasLead;
  initialActivities: CanvasActivity[];
  /** When true, disables Realtime subscription (demo route). */
  demo?: boolean;
  suggestedAction?: ReactNode;
  agentActivity?: ReactNode;
};

/**
 * The Lead Canvas. Sections rendered in order (no tabs, Constitution IX):
 * Header → FieldBlock (More expander) → ActivityStream → SuggestedAction → AgentPanel.
 *
 * Reduced-motion is honored at the MotionConfig root.
 */
export function LeadCanvas(props: Props) {
  const { lead, initialActivities, demo = false, suggestedAction, agentActivity } = props;
  const leadValid = leadSchema.safeParse(lead.data).success;

  return (
    <MotionConfig reducedMotion="user">
      <div data-testid="lead-canvas" data-demo={demo} className="mx-auto max-w-3xl space-y-6 p-8">
        {demo ? (
          <div
            data-testid="demo-banner"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            Demo lead — fictional data, no DB row.
          </div>
        ) : null}
        <CanvasSection delay={0} testId="section-header">
          <CanvasHeader lead={lead} />
        </CanvasSection>
        {leadValid ? (
          <CanvasSection delay={0.05} testId="section-fields">
            <FieldBlock lead={lead} />
          </CanvasSection>
        ) : (
          <CanvasSection delay={0.05} testId="section-schema-mismatch">
            <SchemaMismatch recordId={lead.id} />
          </CanvasSection>
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
      </div>
    </MotionConfig>
  );
}
