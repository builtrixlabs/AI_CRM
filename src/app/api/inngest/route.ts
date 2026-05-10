import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { embeddingRefresh } from "@/lib/inngest/functions/embedding-refresh";
import { leadEnrichmentOnCreate } from "@/lib/inngest/functions/lead-enrichment";
import { doeOnLeadCreated } from "@/lib/inngest/functions/doe-on-lead-created";
import { siteVisitWindowSweep } from "@/lib/inngest/functions/site-visit-window-sweep";
import { webhooksDeliver } from "@/lib/inngest/functions/webhooks-deliver";
import { auditPrune } from "@/lib/inngest/functions/audit-prune";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    embeddingRefresh,
    leadEnrichmentOnCreate,
    doeOnLeadCreated,
    siteVisitWindowSweep,
    webhooksDeliver,
    auditPrune,
  ],
});
