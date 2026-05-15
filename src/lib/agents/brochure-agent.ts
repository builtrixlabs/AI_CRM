// D-600 (V6 Phase 2) — Brochure Agent.
//
// On a Voice IQ `call.next_best_action` event whose `nba.action` asks for
// project material, this agent: resolves the lead → derives match
// criteria from the lead's own data → findBrochuresForAgent (D-607) picks
// the best brochure → the AI gateway drafts a short WhatsApp body → an
// agent_approval_queue row lands (agent_kind='brochure_send') for the
// operator to approve in /admin/agents/queue.
//
// Standalone + injectable-deps (the enrichLead shape) — the Inngest
// function src/lib/inngest/functions/brochure-agent.ts is a thin wrapper.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as gateway from "@/lib/ai/gateway";
import {
  findBrochuresForAgent,
  type BrochureMatchCriteria,
} from "@/lib/brochures/repository";
import type { DocumentType } from "@/lib/brochures/schemas";

export const BROCHURE_AGENT_KIND = "brochure_send";

/** Voice IQ next-best-action values that trigger the Brochure Agent. */
export const BROCHURE_ACTIONS = [
  "send_brochure",
  "send_floor_plan",
  "send_price_sheet",
] as const;
export type BrochureAction = (typeof BROCHURE_ACTIONS)[number];

export function isBrochureAction(action: string): action is BrochureAction {
  return (BROCHURE_ACTIONS as readonly string[]).includes(action);
}

/** Stable service-account uuid for ledger + queue-row provenance. */
export const BROCHURE_AGENT_SERVICE_ACCOUNT =
  "00000000-0000-4000-8000-000000000003";

const ACTION_DOCUMENT_TYPE: Record<BrochureAction, DocumentType> = {
  send_brochure: "brochure",
  send_floor_plan: "floor_plan",
  send_price_sheet: "price_sheet",
};

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type GatewayModule = Pick<typeof gateway, "complete">;

export type BrochureAgentDeps = {
  client?: SupabaseClient;
  gateway?: GatewayModule;
};

export type BrochureAttachment = {
  brochure_id: string;
  title: string;
  document_type: DocumentType;
};

// ── Match-criteria extraction ──────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Derive `findBrochuresForAgent` criteria from the lead node's own `data`.
 * The Voice IQ `nba` payload is lean (`action` only), so project / bhk /
 * budget come from wherever D-604 (MIH) or BANT extraction put them.
 * Every field is optional — with none, the agent still picks the
 * most-recent brochure of the right document_type.
 */
export function extractMatchCriteria(
  organization_id: string,
  leadData: Record<string, unknown> | null,
  action: BrochureAction,
): BrochureMatchCriteria {
  const data = asRecord(leadData);
  const custom = asRecord(data.custom);
  const preference = asRecord(custom.preference);
  const bant = asRecord(custom.bant);

  const criteria: BrochureMatchCriteria = {
    organization_id,
    document_type: ACTION_DOCUMENT_TYPE[action],
  };

  // project_id — a HARD filter downstream, so only accept a UUID-shaped
  // value (`project_interest` is often a free-text name, never set here).
  for (const c of [data.project_id, custom.project_id, preference.project_id]) {
    if (typeof c === "string" && UUID_RE.test(c)) {
      criteria.project_id = c;
      break;
    }
  }

  for (const c of [data.bhk, custom.bhk, preference.bhk]) {
    const n = typeof c === "number" ? c : typeof c === "string" ? Number(c) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 5) {
      criteria.bhk = n;
      break;
    }
  }

  for (const c of [
    data.budget_band,
    custom.budget_band,
    preference.budget_band,
    bant.budget,
  ]) {
    if (typeof c === "string" && c.trim()) {
      criteria.budget_band = c.trim();
      break;
    }
  }

  for (const c of [data.area_sqft, custom.area_sqft, preference.area_sqft]) {
    const n = typeof c === "number" ? c : typeof c === "string" ? Number(c) : NaN;
    if (Number.isFinite(n) && n > 0) {
      criteria.area_sqft = n;
      break;
    }
  }

  return criteria;
}

// ── Message drafting ───────────────────────────────────────────────────────

function deriveFirstName(label: string): string {
  const t = label.trim();
  const sp = t.indexOf(" ");
  return sp > 0 ? t.slice(0, sp) : t || "there";
}

const BROCHURE_SYSTEM_PROMPT =
  "You are a real-estate presales assistant. Draft ONE short, warm, " +
  "professional WhatsApp message (2-3 sentences, plain text, no markdown, " +
  "no emoji) that shares a project document with a customer right after a " +
  "sales call. Address the customer by their first name, name the document, " +
  "and end with a light call-to-action (offer a site visit or to answer " +
  "questions). Output ONLY the message text — no preamble, no quotes.";

function templatedBrochureMessage(
  firstName: string,
  brochureTitle: string,
): string {
  return (
    `Hi ${firstName}, sharing the ${brochureTitle} as discussed on our ` +
    `call. Have a look and let me know if you'd like to schedule a site ` +
    `visit or have any questions — happy to help.`
  );
}

/**
 * Draft the WhatsApp body via the AI gateway, with a deterministic
 * template fallback. A gateway `!ok` (budget cap, provider down) or a
 * thrown error never drops the request — the queue row is always
 * produced. This is the `tier-2-templated-no-gateway` pattern, adapted:
 * gateway-first, template-guaranteed.
 */
export async function draftBrochureMessage(
  args: {
    organization_id: string;
    lead_first_name: string;
    brochure_title: string;
    document_type: DocumentType;
    call_summary?: string | null;
  },
  gw: GatewayModule = gateway,
): Promise<string> {
  const fallback = templatedBrochureMessage(
    args.lead_first_name,
    args.brochure_title,
  );
  const prompt =
    `Customer first name: ${args.lead_first_name}\n` +
    `Document to share: "${args.brochure_title}" ` +
    `(${args.document_type.replace(/_/g, " ")})\n` +
    (args.call_summary ? `Call context: ${args.call_summary}\n` : "") +
    `Draft the WhatsApp message.`;
  try {
    const r = await gw.complete({
      organization_id: args.organization_id,
      agent_id: BROCHURE_AGENT_SERVICE_ACCOUNT,
      prompt,
      system: BROCHURE_SYSTEM_PROMPT,
      max_tokens: 300,
    });
    return r.ok && r.text.trim() ? r.text.trim() : fallback;
  } catch {
    return fallback;
  }
}

/**
 * D-614 seam. `agent_message_policies` (D-614, step 2.5) is not built
 * yet, so this is a constant `require_approval` — D-600 always queues for
 * operator approval. D-614 replaces the body with the real per-org policy
 * lookup; `runBrochureAgent` already branches on the return value.
 */
export async function resolveSendPolicy(
  _organization_id: string,
  _agent_kind: string,
  _client?: SupabaseClient,
): Promise<"auto_send" | "require_approval"> {
  return "require_approval";
}

// ── Agent entry point ──────────────────────────────────────────────────────

export type RunBrochureAgentInput = {
  organization_id: string;
  lead_id: string;
  nba_action: string;
  call_id?: string | null;
};

export type RunBrochureAgentResult =
  | { ok: true; queue_id: string; matched: boolean; brochure_id: string | null }
  | { ok: true; skipped: "not_brochure_action" | "already_pending" }
  | { ok: false; error: "lead_not_found" | "enqueue_failed"; message?: string };

/**
 * The Brochure Agent. Org-scoped throughout — the lead resolve, the
 * brochure match, and the queue insert all carry `organization_id`, so a
 * brochure from another org can never attach to this lead's draft.
 */
export async function runBrochureAgent(
  input: RunBrochureAgentInput,
  deps: BrochureAgentDeps = {},
): Promise<RunBrochureAgentResult> {
  const client = deps.client ?? getSupabaseAdmin();
  const gw = deps.gateway ?? gateway;

  if (!isBrochureAction(input.nba_action)) {
    return { ok: true, skipped: "not_brochure_action" };
  }
  const action = input.nba_action;

  // 1. Resolve the lead — org-scoped (the tenant guard on a service-role read).
  const { data: leadRow } = await client
    .from("nodes")
    .select("id, label, data, workspace_id, organization_id")
    .eq("id", input.lead_id)
    .eq("organization_id", input.organization_id)
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .maybeSingle();
  if (!leadRow) return { ok: false, error: "lead_not_found" };
  const lead = leadRow as {
    id: string;
    label: string;
    data: Record<string, unknown> | null;
    workspace_id: string | null;
  };

  // 2. Match a brochure.
  const criteria = extractMatchCriteria(
    input.organization_id,
    lead.data,
    action,
  );
  const matches = await findBrochuresForAgent(criteria, client);
  const best = matches[0] ?? null;

  // 3. Draft the body + assemble attachments.
  const firstName = deriveFirstName(lead.label);
  const storedNba = asRecord(asRecord(lead.data).custom).next_best_action;
  const callSummary =
    typeof asRecord(storedNba).rationale === "string"
      ? (asRecord(storedNba).rationale as string)
      : null;

  let draftBody: string;
  let attachments: BrochureAttachment[];
  let error: string | null;
  if (best) {
    draftBody = await draftBrochureMessage(
      {
        organization_id: input.organization_id,
        lead_first_name: firstName,
        brochure_title: best.title,
        document_type: best.document_type,
        call_summary: callSummary,
      },
      gw,
    );
    attachments = [
      {
        brochure_id: best.id,
        title: best.title,
        document_type: best.document_type,
      },
    ];
    error = null;
  } else {
    draftBody =
      `No matching ${ACTION_DOCUMENT_TYPE[action].replace(/_/g, " ")} found ` +
      `for ${firstName}. Upload one at /admin/brochures or attach a ` +
      `document manually before sending.`;
    attachments = [];
    error = "no_match";
  }

  // 4. D-614 seam — always 'require_approval' in D-600.
  await resolveSendPolicy(input.organization_id, BROCHURE_AGENT_KIND, client);

  // 5. Enqueue. Idempotent at the DB layer via the partial unique index on
  //    (organization_id, lead_id, agent_kind) WHERE status='pending' — a
  //    duplicate while one is pending is a benign 23505.
  const { data: inserted, error: insErr } = await client
    .from("agent_approval_queue")
    .insert({
      organization_id: input.organization_id,
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      agent_kind: BROCHURE_AGENT_KIND,
      channel: "whatsapp",
      draft_body: draftBody,
      status: "pending",
      attachments,
      error,
      created_by_agent_id: BROCHURE_AGENT_SERVICE_ACCOUNT,
    })
    .select("id")
    .single();
  if (insErr) {
    if (
      (insErr as { code?: string }).code === "23505" ||
      /duplicate/i.test(insErr.message ?? "")
    ) {
      return { ok: true, skipped: "already_pending" };
    }
    return { ok: false, error: "enqueue_failed", message: insErr.message };
  }

  return {
    ok: true,
    queue_id: (inserted as { id: string }).id,
    matched: best !== null,
    brochure_id: best?.id ?? null,
  };
}
