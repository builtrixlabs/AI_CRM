import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { signPayload } from "./signing";

export type DeliveryOutcome = "delivered" | "retry" | "dead";

export type AttemptResult = {
  outcome: DeliveryOutcome;
  status_code: number | null;
  latency_ms: number;
  response_body?: string;
  error_message?: string;
};

export type EnqueueInput = {
  endpoint_id: string;
  organization_id: string;
  event_kind: string;
  payload: Record<string, unknown>;
};

export type DeliveryRow = {
  id: string;
  organization_id: string;
  endpoint_id: string;
  event_kind: string;
  payload: Record<string, unknown>;
  attempt_number: number;
};

export type EndpointRow = {
  id: string;
  url: string;
  secret: string;
  disabled_at: string | null;
};

const DELIVERY_TIMEOUT_MS = 5000;
const RESPONSE_PREVIEW_LIMIT = 4 * 1024;

/**
 * Block obvious SSRF targets — loopback, link-local, private RFC 1918,
 * IPv6 unique-local. Syntactic check on URL.hostname only; does not do
 * DNS resolution (DNS-rebinding mitigation is V3.x, gated by
 * RATE_LIMIT_BACKEND-style ops decision).
 *
 * Returns null on safe URLs, error string on rejected URLs.
 */
export function checkUrlSsrf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid_url";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "unsupported_protocol";
  }
  // Whatwg URL keeps the brackets in `hostname` for IPv6 in some runtimes;
  // strip them defensively so the literal-match below works on any host.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // Loopback hostnames
  if (host === "localhost" || host === "ip6-localhost") return "loopback_host";
  // IPv4 literals
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts[0] === 127) return "loopback_ipv4";
    if (parts[0] === 10) return "private_rfc1918";
    if (parts[0] === 192 && parts[1] === 168) return "private_rfc1918";
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
      return "private_rfc1918";
    }
    if (parts[0] === 169 && parts[1] === 254) return "link_local";
    if (parts[0] === 0) return "reserved";
  }
  // IPv6 literals
  if (host.includes(":")) {
    if (host === "::1") return "loopback_ipv6";
    if (host.startsWith("fe80:") || host.startsWith("fe80::")) {
      return "link_local_ipv6";
    }
    // Unique-local: fc00::/7 → first byte's high 7 bits = 1111 110
    // i.e. hostname starts with "fc" or "fd".
    if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return "ula_ipv6";
  }
  return null;
}

/**
 * Insert a `pending` delivery row that the Inngest worker will pick up
 * within ~60s. Sets next_retry_at to now() so the first poll sweeps it.
 */
export async function enqueueDelivery(
  input: EnqueueInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<{ ok: true; delivery_id: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("webhook_deliveries")
    .insert({
      endpoint_id: input.endpoint_id,
      organization_id: input.organization_id,
      event_kind: input.event_kind,
      payload: input.payload,
      status: "pending",
      attempt_number: 1,
      next_retry_at: new Date().toISOString(),
      status_code: null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert" };
  return { ok: true, delivery_id: (data as { id: string }).id };
}

/**
 * Classify an HTTP response or network failure into one of three buckets.
 *   2xx                  -> delivered
 *   4xx (NOT 408 / 429)  -> dead (no retry — caller's URL is rejecting)
 *   5xx / 408 / 429 / network / timeout -> retry
 *
 * Note: dead-vs-retry is the policy choice; the caller (worker) decides
 * whether to mark dead vs. schedule another retry based on attempt count.
 */
export function classifyResponse(
  status: number | null,
  isNetworkError: boolean
): "delivered" | "retry" | "dead" {
  if (isNetworkError) return "retry";
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "delivered";
  if (status === 408 || status === 429) return "retry";
  if (status >= 500) return "retry";
  return "dead";
}

/**
 * Run ONE delivery attempt. Pure-ish — does not touch the DB; the caller
 * (worker) updates webhook_deliveries / webhook_endpoints based on the
 * returned outcome.
 */
export async function attemptDelivery(
  delivery: DeliveryRow,
  endpoint: EndpointRow,
  fetchImpl: typeof fetch = fetch
): Promise<AttemptResult> {
  if (endpoint.disabled_at) {
    return {
      outcome: "dead",
      status_code: null,
      latency_ms: 0,
      error_message: "endpoint_disabled",
    };
  }

  const ssrfReason = checkUrlSsrf(endpoint.url);
  if (ssrfReason) {
    return {
      outcome: "dead",
      status_code: null,
      latency_ms: 0,
      error_message: `ssrf_blocked:${ssrfReason}`,
    };
  }

  const body = JSON.stringify({
    event_id: delivery.id,
    event_kind: delivery.event_kind,
    organization_id: delivery.organization_id,
    attempt: delivery.attempt_number,
    ts: new Date().toISOString(),
    data: delivery.payload,
  });

  const signature = signPayload(endpoint.secret, body);
  const start = Date.now();

  let resp: Response | null = null;
  let status: number | null = null;
  let networkErr: string | null = null;
  try {
    resp = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-builtrix-signature": signature,
        "x-builtrix-event-kind": delivery.event_kind,
        "x-builtrix-attempt": String(delivery.attempt_number),
        "user-agent": "Builtrix-Webhook/1.0",
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    status = resp.status;
  } catch (err) {
    networkErr = err instanceof Error ? err.message : "network";
  }

  const latency_ms = Date.now() - start;

  let response_body: string | undefined;
  if (resp) {
    try {
      const text = await resp.text();
      response_body = text.slice(0, RESPONSE_PREVIEW_LIMIT);
    } catch {
      response_body = undefined;
    }
  }

  const outcome = classifyResponse(status, networkErr !== null);

  return {
    outcome,
    status_code: status,
    latency_ms,
    response_body,
    error_message: networkErr ?? undefined,
  };
}

