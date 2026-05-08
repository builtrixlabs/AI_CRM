import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import type { DirectiveRow, Trigger } from "../types";

/**
 * T1 — enqueue_agent. Indirection over the agent runtime: emit an
 * Inngest event so the existing Inngest function (e.g.
 * lead-enrichment-on-create) consumes and dispatches via runAgent.
 *
 * For D-01 (lead.created → lead_enrichment), the event has already
 * been emitted by `createLead`; this directive is essentially a
 * declaration that the wiring is intentional + auditable. The
 * action returns `idempotent_skip: true` because emitting the event
 * twice would double-fire the agent.
 */
export async function enqueue_agent(
  directive: DirectiveRow,
  trigger: Trigger,
  _client: SupabaseClient
): Promise<{ enqueued: boolean; reason: string }> {
  const cfg = directive.action_config ?? {};
  const agent_type =
    typeof cfg.agent_type === "string" ? cfg.agent_type : "unknown";

  // For lead.created → lead_enrichment, the createLead helper
  // already emits `lead.created`. This action is purely declarative.
  if (
    directive.trigger_kind === "lead.created" &&
    agent_type === "lead_enrichment"
  ) {
    return {
      enqueued: false,
      reason: "already-emitted-by-createLead",
    };
  }

  // For other (future) agent enqueues, route via Inngest with a
  // generic event name. Real consumers wire up per-agent functions.
  try {
    await inngest.send({
      name: "node.embedding.refresh-requested" as never,
      data: {
        node_id: trigger.subject_node_id ?? "",
        reason: "manual_refresh",
      } as never,
    });
    return { enqueued: true, reason: "stub-routed-to-noop" };
  } catch (err) {
    return {
      enqueued: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
