// D-604 (V6 Phase 1) — Marketing Intelligence Hub lead ingestion.
//
// Implements docs/baselines/122-mih-inbound-contract.md §4-§8. Org-scoped
// dedup (source_external_id, then phone), then create (raw-insert a lead
// node — the D-417 webform precedent) or merge (union new non-null fields,
// keep created_at, no event re-emit). Every call writes a mih_inbound_log
// row + an event_inbox_log row.
//
// `organization_id` is the VERIFIED token org — the route has already
// checked body.organization_id === token org. Every query here filters by
// it; the service-role client bypasses RLS, so the org filter is the
// load-bearing tenant guard (Constitution II).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { recordInboxIngestion } from "@/lib/events/inbox";
import type { MihLeadInbound } from "./schema";

// Placeholder service-account id for MIH ingestion provenance — mirrors
// the WEBFORM_SERVICE_ACCOUNT convention in src/lib/sources/webform/api.ts.
const MIH_SERVICE_ACCOUNT = "00000000-0000-4000-8000-000000000002";
const SOURCE_PRODUCT = "marketing_intelligence_hub";

export type MihInboundStatus =
  | "created"
  | "duplicate_merged"
  | "rejected"
  | "rate_limited";

export type IngestMihLeadResult =
  | { ok: true; lead_id: string; status: "created" | "duplicate_merged" }
  | { ok: false; reason: "no_workspace" | "internal"; message: string };

type LeadNodeRow = {
  id: string;
  data: Record<string, unknown> | null;
};

/** Build the lead `data` jsonb shape (baseline 122 §7). */
function buildLeadData(payload: MihLeadInbound): Record<string, unknown> {
  return {
    phone: payload.phone_e164,
    name: payload.name,
    ...(payload.email ? { email: payload.email } : {}),
    source: payload.source,
    ...(payload.source_campaign_id
      ? { source_campaign_id: payload.source_campaign_id }
      : {}),
    ...(payload.source_ad_id ? { source_ad_id: payload.source_ad_id } : {}),
    source_channel: payload.source_channel,
    source_received_at: payload.source_received_at,
    preference: payload.preference,
    ...(payload.age !== undefined ? { age: payload.age } : {}),
    ...(payload.gender ? { gender: payload.gender } : {}),
    ...(payload.occupation ? { occupation: payload.occupation } : {}),
    ...(payload.notes ? { notes: payload.notes } : {}),
    created_via: "api_sync",
  };
}

/** Per-request MIH audit-ledger write. Best-effort — never throws. */
export async function logMihInbound(
  args: {
    organization_id: string;
    payload: MihLeadInbound;
    status: MihInboundStatus;
    lead_id?: string | null;
    reason?: string | null;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client.from("mih_inbound_log").insert({
    organization_id: args.organization_id,
    external_id: args.payload.external_id,
    phone_e164: args.payload.phone_e164,
    source: args.payload.source,
    source_channel: args.payload.source_channel,
    status: args.status,
    lead_id: args.lead_id ?? null,
    reason: args.reason ?? null,
    raw_payload: args.payload.raw_payload,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[mih_inbound_log] insert failed", error.message);
  }
}

/** Dedup: by source_external_id first, then by phone — both org-scoped. */
async function findExistingLead(
  client: SupabaseClient,
  organization_id: string,
  payload: MihLeadInbound,
): Promise<LeadNodeRow | null> {
  const byExt = await client
    .from("nodes")
    .select("id, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "lead")
    .eq("source_external_id", payload.external_id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const extRow = (byExt as { data: LeadNodeRow | null }).data;
  if (extRow) return extRow;

  const byPhone = await client
    .from("nodes")
    .select("id, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "lead")
    .eq("data->>phone", payload.phone_e164)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const phoneRow = (byPhone as { data: LeadNodeRow | null }).data;
  if (phoneRow) return phoneRow;

  return null;
}

/** Merge: union new non-null fields onto the existing lead; keep created_at. */
async function mergeLead(
  client: SupabaseClient,
  organization_id: string,
  existing: LeadNodeRow,
  payload: MihLeadInbound,
): Promise<void> {
  const incoming = buildLeadData(payload);
  const merged: Record<string, unknown> = { ...(existing.data ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined && v !== null) merged[k] = v;
  }

  await client
    .from("nodes")
    .update({
      data: merged,
      source_external_id: payload.external_id,
      source_payload: payload.raw_payload,
      updated_at: new Date().toISOString(),
      updated_by: MIH_SERVICE_ACCOUNT,
      updated_via: "api_sync",
    })
    .eq("id", existing.id)
    .eq("organization_id", organization_id);

  await client.from("audit_log").insert({
    actor_id: MIH_SERVICE_ACCOUNT,
    actor_type: "system",
    actor_role: "mih_ingest",
    workspace_id: null,
    organization_id,
    table_name: "nodes",
    record_id: existing.id,
    action: "lead_merged",
    diff: {
      source: payload.source,
      external_id: payload.external_id,
      source_channel: payload.source_channel,
    },
  });
}

export async function ingestMihLead(
  args: { organization_id: string; payload: MihLeadInbound },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<IngestMihLeadResult> {
  const { organization_id, payload } = args;

  // 1. Resolve a target workspace (org's oldest-created).
  const w = await client
    .from("workspaces")
    .select("id")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const workspace_id = (w as { data: { id?: string } | null }).data?.id ?? null;
  if (!workspace_id) {
    await logMihInbound(
      { organization_id, payload, status: "rejected", reason: "no_workspace" },
      client,
    );
    return {
      ok: false,
      reason: "no_workspace",
      message: "No workspace available for organization",
    };
  }

  // 2. Dedup (baseline 122 §4) — external_id then phone, org-scoped.
  const existing = await findExistingLead(client, organization_id, payload);
  if (existing) {
    await mergeLead(client, organization_id, existing, payload);
    await Promise.all([
      logMihInbound(
        {
          organization_id,
          payload,
          status: "duplicate_merged",
          lead_id: existing.id,
        },
        client,
      ),
      recordInboxIngestion(
        {
          organization_id,
          event_id: payload.external_id,
          event_kind: "mih.lead.inbound",
          source_product: SOURCE_PRODUCT,
          status: "deduped",
          resulting_node_id: existing.id,
        },
        client,
      ),
    ]);
    // Idempotency (baseline 122 §5): a merge does NOT re-emit lead.created.
    return { ok: true, lead_id: existing.id, status: "duplicate_merged" };
  }

  // 3. Create — raw-insert a lead node (D-417 webform precedent).
  const ins = await client
    .from("nodes")
    .insert({
      organization_id,
      workspace_id,
      node_type: "lead",
      label: payload.name.slice(0, 200),
      state: "new",
      data: buildLeadData(payload),
      source_external_id: payload.external_id,
      source_payload: payload.raw_payload,
      created_by: MIH_SERVICE_ACCOUNT,
      created_via: "api_sync",
      updated_by: MIH_SERVICE_ACCOUNT,
      updated_via: "api_sync",
    })
    .select("id")
    .single();
  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) {
    await logMihInbound(
      { organization_id, payload, status: "rejected", reason: insErr.message },
      client,
    );
    return { ok: false, reason: "internal", message: insErr.message };
  }
  const lead_id = (ins as { data: { id: string } }).data.id;

  // 4. Audit + ledgers (baseline 122 §8).
  await client.from("audit_log").insert({
    actor_id: MIH_SERVICE_ACCOUNT,
    actor_type: "system",
    actor_role: "mih_ingest",
    workspace_id,
    organization_id,
    table_name: "nodes",
    record_id: lead_id,
    action: "lead_ingested",
    diff: {
      source: payload.source,
      external_id: payload.external_id,
      source_channel: payload.source_channel,
    },
  });
  await Promise.all([
    logMihInbound(
      { organization_id, payload, status: "created", lead_id },
      client,
    ),
    recordInboxIngestion(
      {
        organization_id,
        event_id: payload.external_id,
        event_kind: "mih.lead.inbound",
        source_product: SOURCE_PRODUCT,
        status: "ok",
        resulting_node_id: lead_id,
      },
      client,
    ),
  ]);

  // 5. Best-effort lead.created — triggers D-009 enrichment + D-610
  // allocation. Failure to enqueue must NOT roll back the persisted lead.
  try {
    await inngest.send({
      name: "lead.created",
      data: { lead_id, organization_id, workspace_id, source: payload.source },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ingestMihLead] inngest.send(lead.created) failed",
      err instanceof Error ? err.message : err,
    );
  }

  return { ok: true, lead_id, status: "created" };
}
