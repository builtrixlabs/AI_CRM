import { inngest } from "../client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runSiteVisitBookingAgent } from "@/lib/agents/site-visit-agent";

/**
 * D-601 — Site Visit Booking Agent on `agent/site_visit.requested`.
 *
 * `onCallNextBestAction` emits this event when a Voice IQ
 * `call.next_best_action` carries `nba.action='book_site_visit'`. Thin
 * wrapper — all logic lives in `runSiteVisitBookingAgent`, which is
 * org-scoped, injectable-deps, and unit-tested directly.
 *
 * Idempotent: the agent pre-checks for an existing pending booking and
 * the queue insert rides the `(org, lead, agent_kind) WHERE
 * status='pending'` partial unique index, so a re-run is a benign no-op.
 */
export const siteVisitAgentOnRequest = inngest.createFunction(
  {
    id: "site-visit-agent-on-request",
    retries: 1,
    concurrency: { limit: 10 },
    triggers: [{ event: "agent/site_visit.requested" }],
  },
  async ({ event, step }) => {
    const { organization_id, lead_id, nba_action, call_id } = event.data as {
      organization_id: string;
      lead_id: string;
      nba_action: string;
      call_id?: string | null;
    };

    return await step.run("draft-site-visit", async () =>
      runSiteVisitBookingAgent(
        { organization_id, lead_id, nba_action, call_id: call_id ?? null },
        { client: getSupabaseAdmin() },
      ),
    );
  },
);
