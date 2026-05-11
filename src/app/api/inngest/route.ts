import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { embeddingRefresh } from "@/lib/inngest/functions/embedding-refresh";
import { leadEnrichmentOnCreate } from "@/lib/inngest/functions/lead-enrichment";
import { doeOnLeadCreated } from "@/lib/inngest/functions/doe-on-lead-created";
import { siteVisitWindowSweep } from "@/lib/inngest/functions/site-visit-window-sweep";
import { webhooksDeliver } from "@/lib/inngest/functions/webhooks-deliver";
import { auditPrune } from "@/lib/inngest/functions/audit-prune";
import { followUpAgentSweep } from "@/lib/inngest/functions/follow-up-agent-sweep";
import { autoSuspendCron } from "@/lib/inngest/functions/auto-suspend";
import { inventoryExpireHolds } from "@/lib/inngest/functions/inventory-expire-holds";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    embeddingRefresh,
    leadEnrichmentOnCreate,
    doeOnLeadCreated,
    siteVisitWindowSweep,
    webhooksDeliver,
    auditPrune,
    followUpAgentSweep,
    autoSuspendCron,
    inventoryExpireHolds,
  ],
});
