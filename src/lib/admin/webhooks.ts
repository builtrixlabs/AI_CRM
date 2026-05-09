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
 * Stub delivery — writes a synthetic webhook_deliveries row with status=200
 * and a small randomized latency so the UI demoes end-to-end. Real outbound
 * worker is V3.
 */
export async function sendTestDelivery(
  endpoint_id: string,
  organization_id: string,
  user_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<Result<{ delivery_id: string }>> {
  const { data, error } = await client
    .from("webhook_deliveries")
    .insert({
      organization_id,
      endpoint_id,
      event_kind: "test.ping",
      status_code: 200,
      latency_ms: 28 + Math.floor(Math.random() * 50),
      response_preview: "{\"ok\":true,\"message\":\"stub delivery — real worker is V3\"}",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id,
    workspace_id: null,
    table_name: "webhook_deliveries",
    record_id: (data as { id: string }).id,
    action: "webhook_test_delivery_stub",
    diff: { endpoint_id },
  });

  return { ok: true, delivery_id: (data as { id: string }).id };
}
