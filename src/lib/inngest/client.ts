import { Inngest } from "inngest";

/**
 * Typed Inngest client for the CRM. The `id` is stable across environments;
 * EVENT_KEY / SIGNING_KEY are environment-specific (set in Vercel).
 *
 * Event registry — keep in sync as new event triggers land:
 *   node.embedding.refresh-requested  D-002 (this file's first job)
 *   lead.created                      D-009 (Lead Enrichment Agent trigger)
 *   agent/brochure.requested          D-600 (Brochure Agent trigger)
 *   agent/site_visit.requested        D-601 (Site Visit Booking Agent trigger)
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
  /** D-600 — emitted by onCallNextBestAction when a Voice IQ
   *  next-best-action asks for project material. */
  "agent/brochure.requested": {
    data: {
      organization_id: string;
      lead_id: string;
      nba_action: string;
      call_id?: string | null;
    };
  };
  /** D-601 — emitted by onCallNextBestAction when a Voice IQ
   *  next-best-action asks to book a site visit. */
  "agent/site_visit.requested": {
    data: {
      organization_id: string;
      lead_id: string;
      nba_action: string;
      call_id?: string | null;
    };
  };
};

export const inngest = new Inngest({
  id: "builtrix-ai-crm",
  schemas: undefined as never,
});
