import { inngest } from "../client";
import { runWebhookWorker } from "@/lib/webhooks/worker";

/**
 * D-311 — every minute, sweep pending webhook_deliveries and POST them
 * to the registered URL. Retry policy lives in src/lib/webhooks/retry.ts;
 * the worker body lives in src/lib/webhooks/worker.ts so it can be unit-
 * tested without Inngest.
 */
export const webhooksDeliver = inngest.createFunction(
  {
    id: "webhooks-deliver",
    retries: 0,
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    return await step.run("sweep", async () => runWebhookWorker());
  }
);
