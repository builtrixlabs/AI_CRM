import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type WebhookEndpoint = {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  secret_last4: string;
  events_subscribed: string[];
  enabled: boolean;
  created_at: string;
};

export type WebhookDelivery = {
  id: string;
  endpoint_id: string;
  event_kind: string;
  status_code: number;
  latency_ms: number | null;
  response_preview: string | null;
  ts: string;
};

export type CreateInput = {
  organization_id: string;
  user_id: string;
  name: string;
  url: string;
  events: string[];
};

export type Result<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function listEndpoints(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WebhookEndpoint[]> {
  const { data, error } = await client
    .from("webhook_endpoints")
    .select("id, organization_id, name, url, secret, events_subscribed, enabled, created_at")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Array<WebhookEndpoint & { secret: string }>).map((r) => ({
    id: r.id,
    organization_id: r.organization_id,
    name: r.name,
    url: r.url,
    secret_last4: r.secret.slice(-4),
    events_subscribed: Array.isArray(r.events_subscribed) ? r.events_subscribed : [],
    enabled: r.enabled,
    created_at: r.created_at,
  }));
}

export async function listDeliveries(
  endpoint_id: string,
  organization_id: string,
  limit = 20,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WebhookDelivery[]> {
  const { data, error } = await client
    .from("webhook_deliveries")
    .select("id, endpoint_id, event_kind, status_code, latency_ms, response_preview, ts")
    .eq("organization_id", organization_id)
    .eq("endpoint_id", endpoint_id)
    .order("ts", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as WebhookDelivery[];
}

export async function createEndpoint(
  args: CreateInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<Result<{ id: string }>> {
  if (!args.name || args.name.trim().length < 2) {
    return { ok: false, error: "name_required" };
  }
  try {
    new URL(args.url);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  const secret = randomBytes(32).toString("hex");
  const { data, error } = await client
    .from("webhook_endpoints")
    .insert({
      organization_id: args.organization_id,
      name: args.name.trim(),
      url: args.url,
      secret,
      events_subscribed: args.events,
      enabled: true,
      created_by: args.user_id,
      updated_by: args.user_id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  await client.from("audit_log").insert({
    actor_id: args.user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: args.organization_id,
    workspace_id: null,
    table_name: "webhook_endpoints",
    record_id: (data as { id: string }).id,
    action: "webhook_endpoint_created",
    diff: { name: args.name, url: args.url, events: args.events },
  });
  return { ok: true, id: (data as { id: string }).id };
}

export async function toggleEndpoint(
  endpoint_id: string,
  organization_id: string,
  enabled: boolean,
  user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<Result> {
  const { error } = await client
    .from("webhook_endpoints")
    .update({
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: user_id,
    })
    .eq("id", endpoint_id)
    .eq("organization_id", organization_id);
  if (error) return { ok: false, error: error.message };
  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id,
    workspace_id: null,
    table_name: "webhook_endpoints",
    record_id: endpoint_id,
    action: "webhook_endpoint_toggled",
    diff: { enabled },
  });
  return { ok: true };
}

export async function deleteEndpoint(
  endpoint_id: string,
  organization_id: string,
  user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<Result> {
  const { error } = await client
    .from("webhook_endpoints")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user_id,
      updated_at: new Date().toISOString(),
      updated_by: user_id,
    })
    .eq("id", endpoint_id)
    .eq("organization_id", organization_id);
  if (error) return { ok: false, error: error.message };
  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id,
    workspace_id: null,
    table_name: "webhook_endpoints",
    record_id: endpoint_id,
    action: "webhook_endpoint_deleted",
    diff: {},
  });
  return { ok: true };
}

/**
 * D-311 — enqueue a `test.ping` delivery. The Inngest cron (every
 * minute) picks it up within ~60s, signs the body with the endpoint's
 * secret, and POSTs it. Outcome lands back in the webhook_deliveries
 * row (status, status_code, latency, response_preview).
 *
 * Replaces the v2 stub that wrote status=200 directly without firing HTTP.
 */
export async function sendTestDelivery(
  endpoint_id: string,
  organization_id: string,
  user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<Result<{ delivery_id: string }>> {
  const { enqueueDelivery } = await import("@/lib/webhooks/deliver");
  const r = await enqueueDelivery(
    {
      endpoint_id,
      organization_id,
      event_kind: "test.ping",
      payload: { source: "test_button", triggered_by: user_id },
    },
    client
  );
  if (!r.ok) return r;

  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id,
    workspace_id: null,
    table_name: "webhook_deliveries",
    record_id: r.delivery_id,
    action: "webhook_test_delivery_enqueued",
    diff: { endpoint_id },
  });

  return { ok: true, delivery_id: r.delivery_id };
}

/**
 * D-311 — resend a past delivery by enqueueing a fresh `pending` row
 * with the same payload + event_kind. Original row is left untouched
 * (so the audit trail stays intact).
 */
export async function resendDelivery(
  delivery_id: string,
  organization_id: string,
  user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<Result<{ delivery_id: string }>> {
  const { data: orig, error: lookupErr } = await client
    .from("webhook_deliveries")
    .select("endpoint_id, event_kind, payload")
    .eq("id", delivery_id)
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (lookupErr || !orig) {
    return { ok: false, error: "not_found" };
  }
  const o = orig as {
    endpoint_id: string;
    event_kind: string;
    payload: Record<string, unknown>;
  };

  const { enqueueDelivery } = await import("@/lib/webhooks/deliver");
  const r = await enqueueDelivery(
    {
      endpoint_id: o.endpoint_id,
      organization_id,
      event_kind: o.event_kind,
      payload: o.payload,
    },
    client
  );
  if (!r.ok) return r;

  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id,
    workspace_id: null,
    table_name: "webhook_deliveries",
    record_id: r.delivery_id,
    action: "webhook_delivery_resent",
    diff: { resent_from: delivery_id, endpoint_id: o.endpoint_id },
  });

  return { ok: true, delivery_id: r.delivery_id };
}

/**
 * D-311 — re-enable an auto-disabled endpoint. Clears `disabled_at`
 * and zeroes `consecutive_failures`. Org-admin only.
 */
export async function reenableEndpoint(
  endpoint_id: string,
  organization_id: string,
  user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<Result> {
  const { error } = await client
    .from("webhook_endpoints")
    .update({
      disabled_at: null,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
      updated_by: user_id,
    })
    .eq("id", endpoint_id)
    .eq("organization_id", organization_id);
  if (error) return { ok: false, error: error.message };

  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id,
    workspace_id: null,
    table_name: "webhook_endpoints",
    record_id: endpoint_id,
    action: "webhook_endpoint_reenabled",
    diff: {},
  });
  return { ok: true };
}
