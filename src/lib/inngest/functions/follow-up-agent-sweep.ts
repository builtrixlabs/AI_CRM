import { inngest } from "../client";
import { runFollowUpAgent } from "@/lib/agents/follow-up-stale-lead";

/**
 * D-322 — every 6h, scan all orgs for stale leads (state in {new,
 * contacted} + no contact in 7+ days) and enqueue T2 templated
 * follow-up drafts for org-admin approval.
 *
 * Idempotency rides on a partial unique index on
 * agent_approval_queue (organization_id, lead_id, agent_kind)
 * WHERE status = 'pending' — a duplicate insert is a benign 23505.
 */
export const followUpAgentSweep = inngest.createFunction(
  {
    id: "follow-up-agent-sweep",
    retries: 1,
    triggers: [{ cron: "0 */6 * * *" }],
  },
  async ({ step }) => {
    return await step.run("sweep", async () => runFollowUpAgent());
  }
);
