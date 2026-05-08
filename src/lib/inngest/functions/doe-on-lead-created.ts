import { inngest } from "../client";
import { dispatchDirective } from "@/lib/doe/runtime";

/**
 * D-011 — DOE runtime listener on `lead.created`.
 *
 * Fires AFTER lead-enrichment-on-create (Inngest functions run
 * concurrently; D-01's seed declares `enqueue_agent` which is
 * idempotent-skipped because createLead has already emitted the
 * `lead.created` event the lead-enrichment function consumes).
 *
 * The DOE function is responsible for the *non-enrichment* directives
 * that match `lead.created` — D-15 (walk-in attach showroom), and any
 * org-specific overrides authored later.
 */
export const doeOnLeadCreated = inngest.createFunction(
  {
    id: "doe-on-lead-created",
    retries: 1,
    concurrency: { limit: 5 },
    triggers: [{ event: "lead.created" }],
  },
  async ({ event, step }) => {
    const { lead_id, organization_id, workspace_id } = event.data as {
      lead_id: string;
      organization_id: string;
      workspace_id: string;
    };

    return await step.run("dispatch", async () => {
      return await dispatchDirective({
        kind: "lead.created",
        trigger_id: `lead.created:${lead_id}`,
        organization_id,
        workspace_id,
        subject_node_id: lead_id,
        payload: { lead_id },
      });
    });
  },
);
