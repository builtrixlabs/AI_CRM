import { Inngest } from "inngest";

/**
 * Typed Inngest client for the CRM. The `id` is stable across environments;
 * EVENT_KEY / SIGNING_KEY are environment-specific (set in Vercel).
 *
 * Event registry — keep in sync as new event triggers land:
 *   node.embedding.refresh-requested  D-002 (this file's first job)
 *   lead.created                      D-009 (Lead Enrichment Agent trigger)
 */
export type Events = {
  "node.embedding.refresh-requested": {
    data: {
      node_id: string;
      reason: "insert" | "update" | "manual_refresh";
    };
  };
  "lead.created": {
    data: {
      lead_id: string;
      organization_id: string;
      workspace_id: string;
      /** D-604 — the connector name MIH reported (e.g. 'meta_lead_ads'). */
      source?: string;
    };
  };
};

export const inngest = new Inngest({
  id: "builtrix-ai-crm",
  schemas: undefined as never,
});
