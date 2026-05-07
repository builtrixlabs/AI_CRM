import { Inngest } from "inngest";

/**
 * Typed Inngest client for the CRM. The `id` is stable across environments;
 * EVENT_KEY / SIGNING_KEY are environment-specific (set in Vercel).
 *
 * Event registry — keep in sync as new event triggers land:
 *   node.embedding.refresh-requested  D-002 (this file's first job)
 */
export type Events = {
  "node.embedding.refresh-requested": {
    data: {
      node_id: string;
      reason: "insert" | "update" | "manual_refresh";
    };
  };
};

export const inngest = new Inngest({
  id: "builtrix-ai-crm",
  schemas: undefined as never,
});
