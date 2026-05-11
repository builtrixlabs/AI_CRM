import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import {
  WebformSourceError,
  webformIngestPayloadSchema,
  type IngestResult,
  type WebformIngestPayload,
} from "./types";
import { verifyToken } from "./tokens";

const WEBFORM_SERVICE_ACCOUNT = "00000000-0000-4000-8000-000000000001"; // V0 webform agent placeholder

export type IngestArgs = {
  token: string;
  payload_raw: unknown;
};

/**
 * Verify the token, validate the payload, and either:
 *   - create a `nodes` row (`node_type='lead'`, state='new') with full
 *     provenance and return { ok: true, lead_id }; or
 *   - on schema/validation failure, write to `leads_quarantine` and return
 *     { ok: false, reason: 'quarantined', quarantine_id }.
 *
 * Token verification failure → { ok: false, reason: 'invalid_token' }.
 *
 * Side-effect: increments `webform_endpoints.received_count` and updates
 * `last_received_at` on success or quarantine (so operators can see traffic).
 */
export async function ingestLead(
  args: IngestArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<IngestResult> {
  // 1. Token check
  const verified = await verifyToken(args.token, client);
  if (!verified) {
    return { ok: false, reason: "invalid_token" };
  }

  // 2. Resolve target workspace (endpoint's workspace, or org's first workspace).
  let workspace_id: string | null = verified.workspace_id;
  if (!workspace_id) {
    const w = await client
      .from("workspaces")
      .select("id")
      .eq("organization_id", verified.organization_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    workspace_id = ((w.data as { id?: string } | null)?.id) ?? null;
    if (!workspace_id) {
      return {
        ok: false,
        reason: "internal",
        message: "No workspace available for organization",
      };
    }
  }

  // 3. Validate the payload
  const parsed = webformIngestPayloadSchema.safeParse(args.payload_raw);
  if (!parsed.success) {
    const error_reason =
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ") || "validation failed";
    const q = await client
      .from("leads_quarantine")
      .insert({
        organization_id: verified.organization_id,
        webform_endpoint_id: verified.endpoint_id,
        source: "webform",
        raw_payload: args.payload_raw ?? {},
        error_reason,
      })
      .select("id")
      .single();
    const qErr = (q as { error: { message: string } | null }).error;
    if (qErr) {
      return {
        ok: false,
        reason: "internal",
        message: `quarantine write failed: ${qErr.message}`,
      };
    }
    const { id: quarantine_id } = (q as { data: { id: string } }).data;
    await bumpEndpointReceivedCount(client, verified.endpoint_id);
    return {
      ok: false,
      reason: "quarantined",
      quarantine_id,
      endpoint_id: verified.endpoint_id,
    };
  }

  const payload: WebformIngestPayload = parsed.data;

  // 4. Build the lead node row
  const label = (payload.name ?? payload.phone).slice(0, 200);
  const now = new Date().toISOString();
  const leadData: Record<string, unknown> = {
    phone: payload.phone,
    ...(payload.name ? { name: payload.name } : {}),
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.interest ? { interest: payload.interest } : {}),
    ...(payload.notes ? { notes: payload.notes } : {}),
    source: "webform",
    source_received_at: now,
    ...(payload.source_campaign_id
      ? { source_campaign_id: payload.source_campaign_id }
      : {}),
    ...(payload.source_adset_id
      ? { source_adset_id: payload.source_adset_id }
      : {}),
    ...(payload.source_ad_id ? { source_ad_id: payload.source_ad_id } : {}),
    ...(payload.source_channel
      ? { source_channel: payload.source_channel }
      : {}),
    source_payload: args.payload_raw,
    created_via: "api_sync",
  };

  const ins = await client
    .from("nodes")
    .insert({
      organization_id: verified.organization_id,
      workspace_id,
      node_type: "lead",
      label,
      state: "new",
      data: leadData,
      created_by: WEBFORM_SERVICE_ACCOUNT,
      created_via: "api_sync",
      updated_by: WEBFORM_SERVICE_ACCOUNT,
      updated_via: "api_sync",
    })
    .select("id")
    .single();
  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) {
    throw new WebformSourceError(insErr.message, "internal");
  }
  const { id: lead_id } = (ins as { data: { id: string } }).data;

  // 5. Audit + bump endpoint counter
  await client.from("audit_log").insert({
    actor_id: WEBFORM_SERVICE_ACCOUNT,
    actor_type: "service",
    actor_role: "webform_ingest",
    workspace_id,
    organization_id: verified.organization_id,
    table_name: "nodes",
    record_id: lead_id,
    action: "lead_ingested",
    diff: { source: "webform", endpoint_id: verified.endpoint_id },
  });
  await bumpEndpointReceivedCount(client, verified.endpoint_id);

  // D-417 AC-6 — wake the Lead Enrichment Agent (D-009). Mirrors the
  // `lead.created` emit in src/lib/leads/api.ts:createLead. Best-effort:
  // failure to enqueue must NOT roll back the lead — the node is
  // persistent and enrichment is async + retry-able.
  try {
    await inngest.send({
      name: "lead.created",
      data: {
        lead_id,
        organization_id: verified.organization_id,
        workspace_id,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[webform.ingestLead] inngest.send(lead.created) failed",
      err instanceof Error ? err.message : err,
    );
  }

  return { ok: true, lead_id, endpoint_id: verified.endpoint_id };
}

async function bumpEndpointReceivedCount(
  client: SupabaseClient,
  endpoint_id: string,
): Promise<void> {
  // Best-effort, non-blocking — failure to bump the counter must not roll back
  // the lead. Uses an RPC-less pattern: read-then-write. Race-OK at this rate.
  const cur = await client
    .from("webform_endpoints")
    .select("received_count")
    .eq("id", endpoint_id)
    .maybeSingle();
  const count =
    ((cur.data as { received_count?: number } | null)?.received_count ?? 0) + 1;
  await client
    .from("webform_endpoints")
    .update({
      received_count: count,
      last_received_at: new Date().toISOString(),
    })
    .eq("id", endpoint_id);
}
