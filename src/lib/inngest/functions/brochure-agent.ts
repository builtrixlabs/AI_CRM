import { inngest } from "../client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as gateway from "@/lib/ai/gateway";
import { runBrochureAgent } from "@/lib/agents/brochure-agent";

/**
 * D-600 — Brochure Agent on `agent/brochure.requested`.
 *
 * `onCallNextBestAction` emits this event when a Voice IQ
 * `call.next_best_action` carries a brochure-kind `nba.action`. The
 * function is a thin wrapper — all logic lives in `runBrochureAgent`,
 * which is org-scoped, injectable-deps, and unit-tested directly.
 *
 * Inngest's built-in retry handles transient failures; the agent is
 * idempotent (the queue insert rides the
 * `(org, lead, agent_kind) WHERE status='pending'` partial unique index,
 * so a re-run while a draft is pending is a benign no-op).
 */
export const brochureAgentOnRequest = inngest.createFunction(
  {
    id: "brochure-agent-on-request",
    retries: 1,
    concurrency: { limit: 10 },
    triggers: [{ event: "agent/brochure.requested" }],
  },
  async ({ event, step }) => {
    const { organization_id, lead_id, nba_action, call_id } = event.data as {
      organization_id: string;
      lead_id: string;
      nba_action: string;
      call_id?: string | null;
    };

    return await step.run("draft-brochure", async () =>
      runBrochureAgent(
        { organization_id, lead_id, nba_action, call_id: call_id ?? null },
        { gateway, client: getSupabaseAdmin() },
      ),
    );
  },
);
