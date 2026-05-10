import { inngest } from "../client";
import { pruneAll } from "@/lib/platform/retention";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * D-312 — daily retention prune at 03:00 UTC.
 *
 * Reads retention_days_* flags from platform_flags (D-207), calls the
 * matching SECURITY DEFINER prune_* function per table, writes one
 * audit_log row per pruned table for forensic visibility.
 */

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

export const auditPrune = inngest.createFunction(
  {
    id: "audit-prune",
    retries: 1,
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    return await step.run("prune", async () => {
      const results = await pruneAll();
      const admin = getSupabaseAdmin();

      for (const r of results) {
        await admin.from("audit_log").insert({
          actor_id: SYSTEM_UUID,
          actor_type: "system",
          actor_role: "audit_prune_cron",
          organization_id: null,
          workspace_id: null,
          table_name: r.table,
          record_id: SYSTEM_UUID,
          action: "retention_prune",
          diff: {
            scanned: r.scanned,
            deleted: r.deleted,
            retention_days: r.retention_days,
            ...(r.error ? { error: r.error } : {}),
          },
        });
      }

      return {
        results,
        total_deleted: results.reduce((sum, r) => sum + r.deleted, 0),
      };
    });
  }
);
