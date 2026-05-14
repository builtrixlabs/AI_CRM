import { inngest } from "../client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allocateLead } from "@/lib/leads/allocation-engine";

/**
 * D-610 / V6 Phase 1 — Pre-sales Auto-Allocation on `lead.created`.
 *
 * Subscribes to the same event D-009's enrichment function does. Evaluates
 * the org's active allocation rules in priority order and assigns the lead
 * to a presales rep (direct / round-robin / first-available).
 *
 * `concurrency: { limit: 1, key: 'event.data.organization_id' }` serializes
 * allocation runs per org — so the lead_allocation_state round-robin cursor
 * read-pick-write is never interleaved (AC-1's "3 leads → 3 reps" holds
 * without a DB advisory lock). This config is load-bearing.
 */
export const presalesAllocationOnLeadCreated = inngest.createFunction(
  {
    id: "presales-allocation-on-lead-created",
    retries: 1,
    concurrency: { limit: 1, key: "event.data.organization_id" },
    triggers: [{ event: "lead.created" }],
  },
  async ({ event, step }) => {
    const { lead_id, organization_id, workspace_id } = event.data as {
      lead_id: string;
      organization_id: string;
      workspace_id: string;
    };

    return await step.run("allocate", async () => {
      return await allocateLead(
        { lead_id, organization_id, workspace_id },
        getSupabaseAdmin(),
      );
    });
  },
);
