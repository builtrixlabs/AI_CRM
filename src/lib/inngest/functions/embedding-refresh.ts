import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { inngest } from "../client";

/**
 * D-002 stub. Reads pending rows from embedding_queue and marks them
 * deferred-d009. D-009 (Model Gateway) replaces the body to actually call
 * `text-embedding-3-small` and write the resulting vector back to nodes.
 *
 * Two trigger paths supported simultaneously:
 *   1. Event-driven — `node.embedding.refresh-requested` from app code or
 *      a Postgres LISTEN/NOTIFY bridge (D-009 wires the bridge).
 *   2. Cron — every 5 minutes, sweep pending rows in case events were
 *      missed.
 */
export const embeddingRefresh = inngest.createFunction(
  {
    id: "embedding-refresh",
    retries: 3,
    triggers: [
      { event: "node.embedding.refresh-requested" },
      { cron: "*/5 * * * *" },
    ],
  },
  async ({ event, step }) => {
    return await step.run("sweep-pending-queue", async () => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("embedding_queue")
        .select("id, node_id, reason")
        .eq("status", "pending")
        .order("requested_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) {
        return { swept: 0, deferred: 0 };
      }

      const ids = data.map((r) => r.id);
      const { error: updErr } = await supabase
        .from("embedding_queue")
        .update({
          status: "deferred-d009",
          processed_at: new Date().toISOString(),
          last_error: "TODO: D-009 wire Model Gateway",
        })
        .in("id", ids);
      if (updErr) throw updErr;

      console.log(
        `[embedding-refresh] swept ${data.length} pending rows -> deferred-d009 (D-009 will process)`
      );
      return {
        swept: data.length,
        deferred: data.length,
        event_name: event?.name,
      };
    });
  }
);
