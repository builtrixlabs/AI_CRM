import { inngest } from "../client";
import { findUpcomingSiteVisits } from "@/lib/sitevisits/api";
import { dispatchDirective } from "@/lib/doe/runtime";

/**
 * D-012 — every 15 minutes, find scheduled site visits whose
 * `data.scheduled_at` is ~24h or ~2h from now and dispatch the DOE
 * runtime for each one. The DOE seed has D-03 (24h) and D-04 (2h)
 * matching `site_visit.window` with `hours_until` discriminator.
 *
 * Idempotency rides on the DOE runtime: per (directive_id,
 * subject_node_id, trigger_id) — trigger_id is
 * `site_visit.window:<visit_id>:<hours_until>` so re-emitting in
 * the same 30-min window produces `skipped_idempotent`.
 */
export const siteVisitWindowSweep = inngest.createFunction(
  {
    id: "site-visit-window-sweep",
    retries: 1,
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    return await step.run("sweep", async () => {
      const visits24h = await findUpcomingSiteVisits(24, null);
      const visits2h = await findUpcomingSiteVisits(2, null);

      const totals = { dispatched_24h: 0, dispatched_2h: 0 };

      for (const v of visits24h) {
        const out = await dispatchDirective({
          kind: "site_visit.window",
          trigger_id: `site_visit.window:${v.id}:24`,
          organization_id: v.organization_id,
          workspace_id: v.workspace_id,
          subject_node_id: v.lead_id,
          payload: {
            visit_id: v.id,
            lead_id: v.lead_id,
            hours_until: 24,
            scheduled_at: v.scheduled_at,
          },
        });
        if (out.some((r) => r.outcome === "dispatched")) {
          totals.dispatched_24h += 1;
        }
      }

      for (const v of visits2h) {
        const out = await dispatchDirective({
          kind: "site_visit.window",
          trigger_id: `site_visit.window:${v.id}:2`,
          organization_id: v.organization_id,
          workspace_id: v.workspace_id,
          subject_node_id: v.lead_id,
          payload: {
            visit_id: v.id,
            lead_id: v.lead_id,
            hours_until: 2,
            scheduled_at: v.scheduled_at,
          },
        });
        if (out.some((r) => r.outcome === "dispatched")) {
          totals.dispatched_2h += 1;
        }
      }

      return {
        scanned_24h: visits24h.length,
        scanned_2h: visits2h.length,
        ...totals,
      };
    });
  },
);
