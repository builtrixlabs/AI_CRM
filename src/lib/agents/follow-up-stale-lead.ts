import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSendPolicy, type AgentMessagePolicy } from "./send-policy";
import {
  dispatchApprovedDraft,
  FOLLOW_UP_SERVICE_ACCOUNT,
} from "./follow-up/dispatch";

/**
 * D-322 — Follow-up agent (T2: templated, no LLM call).
 *
 * Trigger: lead with state in (new, contacted) AND last contact > 7
 * days ago (proxy: max(data.last_contact_at, created_at)).
 *
 * Output: a templated draft message. T2 means "pre-approved comms" per
 * Constitution I and the existing `tier-2-templated-no-gateway`
 * pattern from D-012 — NO `gateway.complete()` call. Org-admin reviews
 * the draft in /admin/agents/queue and approves / edits / rejects.
 *
 * Real LLM-driven personalization is V3.x as a T3 agent.
 */

export const AGENT_KIND = "follow_up_stale_lead";

export const STALE_THRESHOLD_DAYS = 7;

export type FollowUpDraft = {
  channel: "whatsapp" | "email";
  body: string;
};

type LeadCandidate = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  label: string;
  state: string | null;
  data: {
    name?: string;
    phone?: string;
    email?: string;
    last_contact_at?: string;
    interested_property?: string;
  } | null;
  created_at: string;
};

const FOLLOW_UP_TEMPLATES = {
  whatsapp: (name: string, prop: string | null) =>
    `Hi ${name}, just checking in${
      prop ? ` on your interest in ${prop}` : ""
    } — happy to share an update or schedule a site visit if you're still considering. Reply here anytime.`,

  email: (name: string, prop: string | null) =>
    `Hi ${name},\n\nWanted to circle back${
      prop ? ` on your interest in ${prop}` : ""
    }. If you'd like an updated brochure, pricing, or a site visit slot, let me know — happy to set it up.\n\nWarm regards,\nThe Sales Team`,
};

/**
 * Pure draft builder — given the lead row, returns a channel + body.
 * Channel is `whatsapp` if a phone is present, else `email`.
 */
export function draftFollowUp(
  lead: Pick<LeadCandidate, "label" | "data">
): FollowUpDraft {
  const data = lead.data ?? {};
  const name = data.name ?? lead.label ?? "there";
  const property = data.interested_property ?? null;
  if (data.phone && /^\+?\d{7,}$/.test(data.phone)) {
    return { channel: "whatsapp", body: FOLLOW_UP_TEMPLATES.whatsapp(name, property) };
  }
  if (data.email && /@/.test(data.email)) {
    return { channel: "email", body: FOLLOW_UP_TEMPLATES.email(name, property) };
  }
  // Default: email channel; the queue UI will surface "no contact info".
  return { channel: "email", body: FOLLOW_UP_TEMPLATES.email(name, property) };
}

/**
 * Identify leads in the org that warrant a follow-up draft. Returns
 * an empty array if everyone's fresh.
 */
export async function findStaleLeads(
  organization_id: string,
  now: number = Date.now(),
  client: SupabaseClient = getSupabaseAdmin()
): Promise<LeadCandidate[]> {
  const cutoff = new Date(
    now - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, state, data, created_at"
    )
    .eq("node_type", "lead")
    .eq("organization_id", organization_id)
    .in("state", ["new", "contacted"])
    .is("deleted_at", null)
    .lt("created_at", cutoff)
    .limit(200);

  if (error || !data) return [];

  const out: LeadCandidate[] = [];
  for (const row of data as LeadCandidate[]) {
    const last =
      typeof row.data?.last_contact_at === "string"
        ? new Date(row.data.last_contact_at).getTime()
        : new Date(row.created_at).getTime();
    if (now - last >= STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000) {
      out.push(row);
    }
  }
  return out;
}

/**
 * Insert a queue row. Idempotent at the DB layer via the partial unique
 * index on (organization_id, lead_id, agent_kind) WHERE status='pending'.
 * A second insert for the same lead while one is pending is a no-op
 * (returns the row that already exists OR a 23505 conflict — caller treats
 * conflict as benign).
 *
 * D-614 — under an `auto_send` policy the row is still inserted `pending`
 * first (so the partial unique index still guards duplicates), then
 * promoted to `approved` and dispatched immediately. `decided_by` is the
 * follow-up service account, so provenance distinguishes an auto-send from
 * a human approval.
 */
export async function enqueueFollowUpDraft(
  lead: LeadCandidate,
  client: SupabaseClient = getSupabaseAdmin(),
  policy: AgentMessagePolicy = "require_approval"
): Promise<
  | { ok: true; queue_id: string; dispatched: boolean }
  | { ok: false; error: string }
> {
  const draft = draftFollowUp(lead);
  const { data, error } = await client
    .from("agent_approval_queue")
    .insert({
      organization_id: lead.organization_id,
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      agent_kind: AGENT_KIND,
      channel: draft.channel,
      draft_body: draft.body,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505" || /duplicate/i.test(error.message ?? "")) {
      return { ok: false, error: "already_pending" };
    }
    return { ok: false, error: error.message };
  }
  const queue_id = (data as { id: string }).id;

  let dispatched = false;
  if (policy === "auto_send") {
    await client
      .from("agent_approval_queue")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by: FOLLOW_UP_SERVICE_ACCOUNT,
      })
      .eq("id", queue_id)
      .eq("organization_id", lead.organization_id);
    const sent = await dispatchApprovedDraft(
      {
        queue_id,
        organization_id: lead.organization_id,
        actor_id: FOLLOW_UP_SERVICE_ACCOUNT,
      },
      client
    );
    dispatched = sent.ok;
  }

  return { ok: true, queue_id, dispatched };
}

/**
 * Cron entry point: for each org, find stale leads + enqueue drafts.
 * Returns a summary so the Inngest function can log it.
 *
 * D-614 — the org's `follow_up_stale_lead` send policy is resolved once
 * per org and threaded through to `enqueueFollowUpDraft`. `auto_sent`
 * counts the drafts dispatched immediately under an `auto_send` policy.
 */
export async function runFollowUpAgent(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<{
  orgs_scanned: number;
  drafts_enqueued: number;
  skipped_dup: number;
  auto_sent: number;
}> {
  const summary = {
    orgs_scanned: 0,
    drafts_enqueued: 0,
    skipped_dup: 0,
    auto_sent: 0,
  };

  const { data: orgs } = await client
    .from("organizations")
    .select("id")
    .is("deleted_at", null);

  for (const o of (orgs ?? []) as { id: string }[]) {
    summary.orgs_scanned += 1;
    const policy = await resolveSendPolicy(o.id, AGENT_KIND, client);
    const stale = await findStaleLeads(o.id, Date.now(), client);
    for (const lead of stale) {
      const r = await enqueueFollowUpDraft(lead, client, policy);
      if (r.ok) {
        summary.drafts_enqueued += 1;
        if (r.dispatched) summary.auto_sent += 1;
      } else if (r.error === "already_pending") {
        summary.skipped_dup += 1;
      }
    }
  }

  return summary;
}
