import { inngest } from "../client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as gateway from "@/lib/ai/gateway";
import { enrichLead } from "@/lib/agents/lead-enrichment";

const LEAD_ENRICHMENT_AGENT_TYPE = "lead_enrichment";

/**
 * D-009 / C5 — Lead Enrichment Agent on `lead.created`.
 *
 * Resolves the global lead_enrichment service-account row, then
 * dispatches via the agent runtime. The runtime enforces tier
 * ceiling (T1) + handler dispatch + audit logging. Inngest's
 * built-in retry handles transient failures; the handler itself
 * is idempotent (skips if intent_score is already set).
 */
export const leadEnrichmentOnCreate = inngest.createFunction(
  {
    id: "lead-enrichment-on-create",
    retries: 1,
    concurrency: { limit: 5 },
    triggers: [{ event: "lead.created" }],
  },
  async ({ event, step }) => {
    const { lead_id, organization_id, workspace_id } = event.data as {
      lead_id: string;
      organization_id: string;
      workspace_id: string;
    };

    const agent_id = await step.run("resolve-agent", async () => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("agent_service_accounts")
        .select("id")
        .eq("agent_type", LEAD_ENRICHMENT_AGENT_TYPE)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          `Lead Enrichment Agent service-account row missing — run scripts/seed-agent-service-accounts.sh`,
        );
      }
      return (data as { id: string }).id;
    });

    return await step.run("enrich", async () => {
      const result = await enrichLead(
        {
          agent_id,
          lead_id,
          organization_id,
          workspace_id,
          attempted_tier: "T1",
        },
        { gateway, client: getSupabaseAdmin() },
      );
      return result;
    });
  },
);
