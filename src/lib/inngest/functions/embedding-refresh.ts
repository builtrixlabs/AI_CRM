import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as gateway from "@/lib/ai/gateway";
import { textOfRecord } from "@/lib/nodes/text";
import { inngest } from "../client";

/**
 * D-002 / D-009 — Embedding refresh worker.
 *
 * D-002 shipped this as a stub that marked rows `deferred-d009`.
 * D-009 replaces the body: each pending row's source node is read,
 * `textOfRecord(node)` builds a PII-masked source string, and
 * `gateway.embed` returns a 1536-dim vector that's written to
 * `nodes.embedding`. The queue row is marked `done` (or `failed` on
 * embedding error). Idempotent — re-processing the same node is a
 * no-op (the queue row goes from `pending` → `done` once and the
 * vector is over-written with the same value).
 *
 * Two trigger paths:
 *   1. Event-driven — `node.embedding.refresh-requested`.
 *   2. Cron — every 5 minutes, sweep stragglers.
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
        .limit(20);
      if (error) throw error;
      if (!data || data.length === 0) {
        return { processed: 0, ok: 0, failed: 0, event_name: event?.name };
      }

      let okCount = 0;
      let failedCount = 0;

      for (const row of data) {
        const queue_id = (row as { id: string }).id;
        const node_id = (row as { node_id: string }).node_id;

        // Mark `processing` first to avoid concurrent worker pickup.
        await supabase
          .from("embedding_queue")
          .update({ status: "processing" })
          .eq("id", queue_id);

        // Read the node we're embedding.
        const { data: node, error: nodeErr } = await supabase
          .from("nodes")
          .select("id, node_type, label, data, state, organization_id")
          .eq("id", node_id)
          .maybeSingle();
        if (nodeErr || !node) {
          await supabase
            .from("embedding_queue")
            .update({
              status: "failed",
              processed_at: new Date().toISOString(),
              last_error: nodeErr ? nodeErr.message : "node not found",
            })
            .eq("id", queue_id);
          failedCount += 1;
          continue;
        }

        const sourceText = textOfRecord({
          node_type: (node as { node_type: string }).node_type,
          label: (node as { label: string }).label,
          data: (node as { data: Record<string, unknown> | null }).data,
          state: (node as { state: string | null }).state,
        });

        const embedResult = await gateway.embed({
          text: sourceText,
          organization_id: (node as { organization_id: string }).organization_id,
          request_id: queue_id,
        });

        if (!embedResult.ok) {
          await supabase
            .from("embedding_queue")
            .update({
              status: "failed",
              processed_at: new Date().toISOString(),
              last_error: `${embedResult.error}: ${embedResult.message}`,
            })
            .eq("id", queue_id);
          failedCount += 1;
          continue;
        }

        // Write the vector and mark done.
        const { error: writeErr } = await supabase
          .from("nodes")
          .update({ embedding: embedResult.vector })
          .eq("id", node_id);
        if (writeErr) {
          await supabase
            .from("embedding_queue")
            .update({
              status: "failed",
              processed_at: new Date().toISOString(),
              last_error: `write: ${writeErr.message}`,
            })
            .eq("id", queue_id);
          failedCount += 1;
          continue;
        }

        await supabase
          .from("embedding_queue")
          .update({
            status: "done",
            processed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", queue_id);
        okCount += 1;
      }

      return {
        processed: data.length,
        ok: okCount,
        failed: failedCount,
        event_name: event?.name,
      };
    });
  },
);
