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
import { presalesAllocationOnLeadCreated } from "@/lib/inngest/functions/presales-allocation";
import { brochureAgentOnRequest } from "@/lib/inngest/functions/brochure-agent";
import { siteVisitAgentOnRequest } from "@/lib/inngest/functions/site-visit-agent";

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
    // D-610 — pre-sales auto-allocation on lead.created.
    presalesAllocationOnLeadCreated,
    // D-600 — Brochure Agent on agent/brochure.requested.
    brochureAgentOnRequest,
    // D-601 — Site Visit Booking Agent on agent/site_visit.requested.
    siteVisitAgentOnRequest,
  ],
});
