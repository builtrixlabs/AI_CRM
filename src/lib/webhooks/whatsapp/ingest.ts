import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createNode } from "@/lib/nodes/api";
import { maskPii } from "@/lib/nodes/text";
import { recordIngestion } from "./log";
import type { IngestResult, WhatsAppInboundPayload } from "./types";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

export type IngestDeps = {
  client?: SupabaseClient;
};

export type IngestArgs = {
  payload: WhatsAppInboundPayload;
  organization_id: string;
};

/**
 * Normalize a phone number for matching.
 * - Strips spaces, parens, dashes.
 * - Keeps a leading '+' if present.
 * - Does NOT validate length; that's the lead schema's job.
 */
export function normalizePhone(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const lead = trimmed.startsWith("+") ? "+" : "";
  return lead + trimmed.replace(/[^\d]/g, "");
}

/**
 * Find the active lead matching `from_phone` within the org. Cross-tenant
 * leak is impossible because the SELECT filters by `organization_id`.
 *
 * V0 matches exactly on the normalized phone string. Fuzzy matching
 * (last-7-digits) is a V1 enhancement.
 */
async function findLeadByPhone(
  client: SupabaseClient,
  organization_id: string,
  phone_e164: string
): Promise<{ id: string; workspace_id: string } | null> {
  if (!phone_e164) return null;

  const { data, error } = await client
    .from("nodes")
    .select("id, workspace_id, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .eq("data->>phone", phone_e164)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: string; workspace_id: string };
  return { id: row.id, workspace_id: row.workspace_id };
}

/**
 * Look up an existing activity for the same wa_message_id within the
 * org. The dedup contract is per-org (D-010 / B5).
 */
async function findExistingActivityForMessage(
  client: SupabaseClient,
  organization_id: string,
  wa_message_id: string
): Promise<{ id: string; subject_node_id: string | null } | null> {
  // We store wa_message_id as `data.custom.wa_message_id` AND as the
  // `source_event_id` (a uuid coercion of the message id is impossible —
  // the provider id is text, not uuid). So we filter on the JSONB key.
  const { data, error } = await client
    .from("nodes")
    .select("id, data")
    .eq("organization_id", organization_id)
    .eq("node_type", "activity")
    .is("deleted_at", null)
    .eq("data->custom->>wa_message_id", wa_message_id)
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: string; data: Record<string, unknown> | null };
  const subject_id =
    typeof row.data?.subject_node_id === "string"
      ? (row.data.subject_node_id as string)
      : null;
  return { id: row.id, subject_node_id: subject_id };
}

async function resolveDefaultWorkspace(
  client: SupabaseClient,
  organization_id: string
): Promise<string | null> {
  const { data, error } = await client
    .from("org_whatsapp_endpoints")
    .select("workspace_default_id")
    .eq("organization_id", organization_id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { workspace_default_id: string }).workspace_default_id;
}

async function ensureInboxLead(
  client: SupabaseClient,
  workspace_id: string
): Promise<string | null> {
  const { data, error } = await client.rpc("ensure_workspace_inbox_lead", {
    p_workspace_id: workspace_id,
  });
  if (error || !data) return null;
  return data as string;
}

/**
 * D-010 core: ingest one inbound WhatsApp message into the graph.
 *
 * Idempotent by `wa_message_id` (per org) — second invocation with
 * the same id returns `deduped: true` with the original activity_id
 * and never inserts. The dedup check happens BEFORE any node insert,
 * so retries don't grow the audit log either.
 *
 * Tenant isolation: every query filters by `organization_id`. The
 * caller (route) supplies the org id from a verified path
 * (signed-secret lookup against `org_whatsapp_endpoints`).
 */
export async function upsertActivityFromWhatsApp(
  args: IngestArgs,
  deps: IngestDeps = {}
): Promise<IngestResult> {
  const client = deps.client ?? getSupabaseAdmin();
  const { payload, organization_id } = args;

  if (!payload.wa_message_id) {
    return { ok: false, status: "rejected", reason: "missing wa_message_id" };
  }
  if (!organization_id) {
    return { ok: false, status: "rejected", reason: "missing organization_id" };
  }

  const phone_e164 = normalizePhone(payload.from_phone);

  // 1. Dedup check.
  const existing = await findExistingActivityForMessage(
    client,
    organization_id,
    payload.wa_message_id
  );
  if (existing) {
    await recordIngestion(
      {
        organization_id,
        workspace_id: null,
        wa_message_id: payload.wa_message_id,
        from_phone_e164: phone_e164 || null,
        status: "deduped",
        activity_id: existing.id,
        lead_id: existing.subject_node_id,
      },
      client
    );
    return {
      ok: true,
      status: "deduped",
      activity_id: existing.id,
      lead_id: existing.subject_node_id,
      deduped: true,
    };
  }

  // 2. Resolve subject — match by phone, fall back to inbox.
  let subject_lead_id: string | null = null;
  let workspace_id: string | null = null;
  let isOrphan = false;

  const matched = await findLeadByPhone(client, organization_id, phone_e164);
  if (matched) {
    subject_lead_id = matched.id;
    workspace_id = matched.workspace_id;
  } else {
    isOrphan = true;
    workspace_id = await resolveDefaultWorkspace(client, organization_id);
    if (!workspace_id) {
      const reason = "no default workspace configured for org";
      await recordIngestion(
        {
          organization_id,
          workspace_id: null,
          wa_message_id: payload.wa_message_id,
          from_phone_e164: phone_e164 || null,
          status: "error",
          reason,
        },
        client
      );
      return { ok: false, status: "error", reason };
    }
    subject_lead_id = await ensureInboxLead(client, workspace_id);
    if (!subject_lead_id) {
      const reason = "ensure_workspace_inbox_lead returned null";
      await recordIngestion(
        {
          organization_id,
          workspace_id,
          wa_message_id: payload.wa_message_id,
          from_phone_e164: phone_e164 || null,
          status: "error",
          reason,
        },
        client
      );
      return { ok: false, status: "error", reason };
    }
  }

  // 3. Insert activity node via D-002's createNode helper.
  // PII-mask the summary; keep raw body in `data.body` so the canvas
  // can render it (Constitution VII applies to *logs*, not the canvas).
  const masked_phone = phone_e164 ? maskPii(phone_e164) : "[unknown]";
  const summary = `WhatsApp from ${masked_phone}`;

  let activity_id: string;
  try {
    const created = await createNode(
      {
        organization_id,
        workspace_id: workspace_id!,
        node_type: "activity",
        label: summary,
        data: {
          subject_node_id: subject_lead_id!,
          kind: "whatsapp",
          summary,
          body: payload.body,
          custom: {
            wa_message_id: payload.wa_message_id,
            from_phone: phone_e164,
            to_phone: normalizePhone(payload.to_phone),
            provider_ts: payload.ts,
          },
        },
        created_by: SYSTEM_UUID,
        created_via: "whatsapp",
      },
      client
    );
    activity_id = created.id;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await recordIngestion(
      {
        organization_id,
        workspace_id,
        wa_message_id: payload.wa_message_id,
        from_phone_e164: phone_e164 || null,
        status: "error",
        reason,
      },
      client
    );
    return { ok: false, status: "error", reason };
  }

  // 4. Edge: activity --mentioned_in--> lead. Skipped on orphan
  // because the inbox-lead linkage is implicit via subject_node_id;
  // a `mentioned_in` edge for the orphan would clutter dashboards.
  if (!isOrphan && subject_lead_id) {
    const { error: edgeErr } = await client.from("edges").insert({
      organization_id,
      workspace_id: workspace_id!,
      from_node_id: activity_id,
      to_node_id: subject_lead_id,
      edge_type: "mentioned_in",
      created_by: SYSTEM_UUID,
      created_via: "whatsapp",
      updated_by: SYSTEM_UUID,
      updated_via: "whatsapp",
    });
    if (edgeErr) {
      console.warn(
        "[whatsapp_ingest] edge insert failed",
        edgeErr.message,
        activity_id
      );
    }
  }

  // 5. Audit row — system actor.
  const auditRes = await client.from("audit_log").insert({
    actor_id: SYSTEM_UUID,
    actor_type: "system",
    actor_role: "whatsapp_webhook",
    organization_id,
    workspace_id,
    table_name: "nodes",
    record_id: activity_id,
    action: "whatsapp_inbound",
    compiled_artifact: {
      wa_message_id: payload.wa_message_id,
      lead_id: subject_lead_id,
      orphan: isOrphan,
      masked_from: masked_phone,
    },
  });
  if (auditRes.error) {
    console.warn("[whatsapp_ingest] audit insert failed", auditRes.error.message);
  }

  // 6. Final ledger row.
  await recordIngestion(
    {
      organization_id,
      workspace_id,
      wa_message_id: payload.wa_message_id,
      from_phone_e164: phone_e164 || null,
      status: isOrphan ? "orphan" : "ok",
      activity_id,
      lead_id: subject_lead_id,
    },
    client
  );

  return {
    ok: true,
    status: isOrphan ? "orphan" : "ok",
    activity_id,
    lead_id: subject_lead_id,
    deduped: false,
  };
}
