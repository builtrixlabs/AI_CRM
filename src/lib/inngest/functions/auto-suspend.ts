/**
 * V3.x — Inngest cron: auto-suspend orgs whose grace window expired.
 *
 * Runs hourly (`0 * * * *`). Idempotent re-entry. Companion to D-310
 * billing: webhook handlers move past_due → past_due+grace_period_until,
 * this cron flips them to suspended after the grace expires.
 */
import { inngest } from "../client";
import { runAutoSuspendSweep } from "@/lib/platform/auto-suspend";

export const autoSuspendCron = inngest.createFunction(
  {
    id: "billing-auto-suspend-sweep",
    retries: 1,
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    return await step.run("sweep", async () => runAutoSuspendSweep());
  },
);
