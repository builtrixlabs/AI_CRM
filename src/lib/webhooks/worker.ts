import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  attemptDelivery,
  type DeliveryRow,
  type EndpointRow,
} from "./deliver";
import { MAX_ATTEMPTS, nextRetryAt } from "./retry";

/**
 * D-311 — sweep one batch of pending deliveries. Used by the Inngest
 * cron AND by integration tests that run the worker against a mocked DB.
 *
 * Returns a summary so the cron's caller can log meaningfully.
 */

const DELIVERY_BATCH_LIMIT = 50;
const AUTO_DISABLE_THRESHOLD = 10;

export type WorkerSummary = {
  scanned: number;
  delivered: number;
  retried: number;
  dead: number;
  endpoints_disabled: number;
};

type RawDelivery = {
  id: string;
  organization_id: string;
  endpoint_id: string;
  event_kind: string;
  payload: Record<string, unknown>;
  attempt_number: number;
};

type RawEndpoint = {
  id: string;
  url: string;
  secret: string;
  disabled_at: string | null;
  enabled: boolean;
  consecutive_failures: number;
};

export async function runWebhookWorker(
  client: SupabaseClient = getSupabaseAdmin(),
  fetchImpl: typeof fetch = fetch
): Promise<WorkerSummary> {
  const summary: WorkerSummary = {
    scanned: 0,
    delivered: 0,
    retried: 0,
    dead: 0,
    endpoints_disabled: 0,
  };

  const { data: pending, error: pendingErr } = await client
    .from("webhook_deliveries")
    .select(
      "id, organization_id, endpoint_id, event_kind, payload, attempt_number"
    )
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(DELIVERY_BATCH_LIMIT);

  if (pendingErr || !pending) return summary;
  summary.scanned = pending.length;

  for (const raw of pending as RawDelivery[]) {
    const { data: endpoint } = await client
      .from("webhook_endpoints")
      .select("id, url, secret, disabled_at, enabled, consecutive_failures")
      .eq("id", raw.endpoint_id)
      .maybeSingle();

    if (!endpoint) {
      await markDead(client, raw.id, "endpoint_not_found");
      summary.dead += 1;
      continue;
    }

    const ep = endpoint as RawEndpoint;
    if (ep.disabled_at || !ep.enabled) {
      await markDead(client, raw.id, "endpoint_disabled");
      summary.dead += 1;
      continue;
    }

    const delivery: DeliveryRow = raw;
    const epRow: EndpointRow = {
      id: ep.id,
      url: ep.url,
      secret: ep.secret,
      disabled_at: ep.disabled_at,
    };

    const result = await attemptDelivery(delivery, epRow, fetchImpl);

    if (result.outcome === "delivered") {
      await client
        .from("webhook_deliveries")
        .update({
          status: "delivered",
          status_code: result.status_code,
          latency_ms: result.latency_ms,
          response_preview: result.response_body ?? null,
          delivered_at: new Date().toISOString(),
          next_retry_at: null,
          error_message: null,
        })
        .eq("id", raw.id);
      await client
        .from("webhook_endpoints")
        .update({ consecutive_failures: 0 })
        .eq("id", ep.id);
      summary.delivered += 1;
      continue;
    }

    // outcome is "retry" or "dead" — bump endpoint failure counter.
    const new_failures = ep.consecutive_failures + 1;
    const should_disable_now =
      new_failures >= AUTO_DISABLE_THRESHOLD && !ep.disabled_at;

    await client
      .from("webhook_endpoints")
      .update({
        consecutive_failures: new_failures,
        ...(should_disable_now
          ? { disabled_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", ep.id);
    if (should_disable_now) summary.endpoints_disabled += 1;

    if (result.outcome === "retry" && raw.attempt_number < MAX_ATTEMPTS) {
      const next = nextRetryAt(raw.attempt_number);
      if (next) {
        await client
          .from("webhook_deliveries")
          .update({
            status: "pending",
            attempt_number: raw.attempt_number + 1,
            next_retry_at: next,
            status_code: result.status_code,
            latency_ms: result.latency_ms,
            response_preview: result.response_body ?? null,
            error_message: result.error_message ?? null,
          })
          .eq("id", raw.id);
        summary.retried += 1;
        continue;
      }
    }

    // dead — either max attempts reached or 4xx classification.
    const status =
      result.outcome === "dead" && result.status_code !== null
        ? "failed"
        : "dead";
    await client
      .from("webhook_deliveries")
      .update({
        status,
        attempt_number: raw.attempt_number,
        next_retry_at: null,
        status_code: result.status_code,
        latency_ms: result.latency_ms,
        response_preview: result.response_body ?? null,
        error_message: result.error_message ?? null,
      })
      .eq("id", raw.id);
    summary.dead += 1;
  }

  return summary;
}

async function markDead(
  client: SupabaseClient,
  delivery_id: string,
  error: string
): Promise<void> {
  await client
    .from("webhook_deliveries")
    .update({
      status: "dead",
      next_retry_at: null,
      error_message: error,
    })
    .eq("id", delivery_id);
}
