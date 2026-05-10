import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/platform/flags";

/**
 * D-312 — daily retention prune for the high-volume operational tables.
 *
 * Defaults live in `platform_flags` (D-207); operator can override via
 * `/platform/settings`. The Inngest cron at 03:00 UTC reads those flags
 * and calls the matching SECURITY DEFINER `prune_*` SQL functions.
 *
 * Min-row safety floor: each table is left alone if its total row count
 * is at or below the floor (default 100). Protects fresh deploys + dev
 * environments where you don't want a fresh `audit_log` to lose its
 * first few rows just because they're stale.
 */

export type PruneTable =
  | "api_audit_log"
  | "event_inbox_log"
  | "webhook_deliveries";

export const PRUNE_TABLES: ReadonlyArray<PruneTable> = [
  "api_audit_log",
  "event_inbox_log",
  "webhook_deliveries",
] as const;

export type PruneEntry = {
  table: PruneTable;
  scanned: number;
  deleted: number;
  retention_days: number;
  error?: string;
};

const DEFAULT_RETENTION: Record<PruneTable, number> = {
  api_audit_log: 90,
  event_inbox_log: 30,
  webhook_deliveries: 60,
};

const RPC_NAMES: Record<PruneTable, string> = {
  api_audit_log: "prune_api_audit_log",
  event_inbox_log: "prune_event_inbox_log",
  webhook_deliveries: "prune_webhook_deliveries",
};

const FLAG_NAMES: Record<PruneTable, string> = {
  api_audit_log: "retention_days_api_audit_log",
  event_inbox_log: "retention_days_event_inbox_log",
  webhook_deliveries: "retention_days_webhook_deliveries",
};

const MIN_FLOOR_FLAG = "retention_min_floor";
const DEFAULT_MIN_FLOOR = 100;

export async function pruneOne(
  table: PruneTable,
  retention_days: number,
  min_floor: number,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PruneEntry> {
  const { data, error } = await client.rpc(RPC_NAMES[table], {
    retention_days,
    min_floor,
  });
  if (error) {
    return {
      table,
      scanned: 0,
      deleted: 0,
      retention_days,
      error: error.message,
    };
  }
  // RPC returns SETOF (scanned, deleted) — Supabase typed return is an
  // array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      table,
      scanned: 0,
      deleted: 0,
      retention_days,
      error: "no_rows_returned",
    };
  }
  return {
    table,
    scanned: Number((row as { scanned: number }).scanned ?? 0),
    deleted: Number((row as { deleted: number }).deleted ?? 0),
    retention_days,
  };
}

/**
 * V3.x — read the resolved retention day count for one (org, table) pair.
 * Per-org override → platform_flags default → hardcoded default.
 *
 * Backed by the `get_org_retention_days(uuid, text)` SECURITY DEFINER RPC
 * (migration 20260510130000_org_retention_overrides.sql).
 */
export async function getOrgRetentionDays(
  org_id: string,
  table: PruneTable,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<number> {
  const { data, error } = await client.rpc("get_org_retention_days", {
    p_org_id: org_id,
    p_table: table,
  });
  if (error) return DEFAULT_RETENTION[table];
  const v = typeof data === "number" ? data : Number(data);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_RETENTION[table];
}

export async function pruneAll(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<PruneEntry[]> {
  const minFloor = await getFlag<number>(
    MIN_FLOOR_FLAG,
    DEFAULT_MIN_FLOOR,
    client
  );

  const results: PruneEntry[] = [];
  for (const table of PRUNE_TABLES) {
    const days = await getFlag<number>(
      FLAG_NAMES[table],
      DEFAULT_RETENTION[table],
      client
    );
    results.push(await pruneOne(table, days, minFloor, client));
  }
  return results;
}
