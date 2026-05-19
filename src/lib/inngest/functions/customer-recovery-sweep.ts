import { inngest } from "../client";
import { runRecoverySweep } from "@/lib/recovery/sweep";

/**
 * D-616 — every 6h, scan all orgs for recovery candidates (lost,
 * on_hold, or 14d-stale contacted/qualified leads) and insert open
 * customer_recovery_queue rows.
 *
 * Idempotency rides on a partial-unique index on
 * customer_recovery_queue (organization_id, lead_id) WHERE
 * resolved_at IS NULL — a duplicate insert is a benign 23505 caught
 * inside enqueueRecoveryCandidate.
 */
export const customerRecoverySweep = inngest.createFunction(
  {
    id: "customer-recovery-sweep",
    retries: 1,
    triggers: [{ cron: "0 */6 * * *" }],
  },
  async ({ step }) => {
    return await step.run("sweep", async () => runRecoverySweep());
  },
);
