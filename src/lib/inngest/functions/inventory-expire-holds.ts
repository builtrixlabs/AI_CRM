import { inngest } from "../client";
import { expireInventoryHolds } from "@/lib/inventory/state-api";

/**
 * D-420 — hourly cron that reverts expired Held/Blocked unit states back to
 * Available. Calls `expire_inventory_holds()` (service-role gated RPC).
 *
 * Worst-case latency: ~1h past TTL. Acceptable for V1; cadence is a one-line
 * config change if customer experience demands tighter.
 */
export const inventoryExpireHolds = inngest.createFunction(
  {
    id: "inventory-expire-holds",
    retries: 1,
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    return await step.run("expire", async () => {
      const result = await expireInventoryHolds();
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error("[inventory-expire-holds] RPC error", result.error);
        return { ok: false, error: result.error };
      }
      return { ok: true, expired: result.expired };
    });
  },
);
