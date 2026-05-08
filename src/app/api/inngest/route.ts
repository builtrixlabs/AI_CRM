import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { embeddingRefresh } from "@/lib/inngest/functions/embedding-refresh";
import { leadEnrichmentOnCreate } from "@/lib/inngest/functions/lead-enrichment";
import { doeOnLeadCreated } from "@/lib/inngest/functions/doe-on-lead-created";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [embeddingRefresh, leadEnrichmentOnCreate, doeOnLeadCreated],
});
