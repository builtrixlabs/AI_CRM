// D-601 (V6 Phase 2) — Site Visit Booking Agent.
//
// runSiteVisitBookingAgent: on a Voice IQ `call.next_best_action` event
// with nba.action='book_site_visit', create a draft `site_visit` node +
// an `attended` edge + a `site_visit_booking` row in the approval queue.
// confirmSiteVisitBooking: the submit-the-cab-form path — write the cab
// details onto the visit, transition draft → scheduled, auto-assign the
// project's sales rep (D-608), compose the WhatsApp confirmation, and
// dispatch it via the D-415/D-603 path.
//
// Org-scoped throughout; injectable deps (the enrichLead shape).

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createNode, updateNodeData } from "@/lib/nodes/api";
import { transitionSiteVisit } from "@/lib/sitevisits/api";
import { resolveSalesRepForProject } from "@/lib/projects/sales-mapping";
import { dispatchApprovedDraft } from "@/lib/agents/follow-up/dispatch";

export const SITE_VISIT_BOOKING_AGENT_KIND = "site_visit_booking";
export const SITE_VISIT_BOOKING_ACTION = "book_site_visit";

export function isSiteVisitBookingAction(action: string): boolean {
  return action === SITE_VISIT_BOOKING_ACTION;
}

/** Stable service-account uuid for the agent-created draft + queue row. */
export const SITE_VISIT_AGENT_SERVICE_ACCOUNT =
  "00000000-0000-4000-8000-000000000005";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function pickUuid(candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && UUID_RE.test(c)) return c;
  }
  return undefined;
}

function pickDatetime(candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const t = Date.parse(c);
      if (Number.isFinite(t)) return new Date(t).toISOString();
    }
  }
  return undefined;
}

function deriveFirstName(label: string): string {
  const t = label.trim();
  const sp = t.indexOf(" ");
  return sp > 0 ? t.slice(0, sp) : t || "there";
}

// ── Cab form schema ────────────────────────────────────────────────────────

export const cabDetailsSchema = z
  .object({
    /** The confirmed visit date/time the operator sets in the form. */
    scheduled_at: z.string().datetime(),
    pickup_address: z.string().min(1).max(500),
    pickup_time: z.string().datetime(),
    cab_provider: z.string().min(1).max(100),
    cab_booking_ref: z.string().max(100).optional(),
    driver_name: z.string().min(1).max(120),
    driver_phone: z.string().min(5).max(20),
    vehicle_number: z.string().min(1).max(20),
  })
  .strict();

export type CabDetails = z.infer<typeof cabDetailsSchema>;

// ── WhatsApp confirmation copy ─────────────────────────────────────────────

function fmtDateIST(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
function fmtTimeIST(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/**
 * The customer-facing WhatsApp confirmation (PRD §3.2 template). Pure —
 * unit-tested directly.
 */
export function composeSiteVisitConfirmation(args: {
  lead_first_name: string;
  cab: CabDetails;
  project_name: string | null;
}): string {
  const visitDate = fmtDateIST(args.cab.scheduled_at);
  const visitTime = fmtTimeIST(args.cab.scheduled_at);
  const pickupTime = fmtTimeIST(args.cab.pickup_time);
  return (
    `Hi ${args.lead_first_name}, your site visit is confirmed for ` +
    `${visitDate} at ${visitTime}. Cab ${args.cab.vehicle_number} ` +
    `(driver ${args.cab.driver_name}, ${args.cab.driver_phone}) will reach ` +
    `${args.cab.pickup_address} by ${pickupTime}. ` +
    (args.project_name
      ? `Looking forward to seeing you at ${args.project_name}.`
      : `Looking forward to seeing you.`)
  );
}

// ── Agent: create the draft + queue row ────────────────────────────────────

export type SiteVisitAgentDeps = {
  client?: SupabaseClient;
};

export type RunSiteVisitBookingInput = {
  organization_id: string;
  lead_id: string;
  nba_action: string;
  call_id?: string | null;
};

export type RunSiteVisitBookingResult =
  | { ok: true; queue_id: string; site_visit_id: string }
  | { ok: true; skipped: "not_booking_action" | "already_pending" }
  | {
      ok: false;
      error: "lead_not_found" | "create_failed" | "enqueue_failed";
      message?: string;
    };

export async function runSiteVisitBookingAgent(
  input: RunSiteVisitBookingInput,
  deps: SiteVisitAgentDeps = {},
): Promise<RunSiteVisitBookingResult> {
  const client = deps.client ?? getSupabaseAdmin();

  if (!isSiteVisitBookingAction(input.nba_action)) {
    return { ok: true, skipped: "not_booking_action" };
  }

  // 1. Resolve the lead — org-scoped (the tenant guard on a service-role read).
  const { data: leadRow } = await client
    .from("nodes")
    .select("id, label, data, workspace_id")
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
    workspace_id: string;
  };

  // 2. Pre-check for an existing pending booking — avoids orphaning a draft
  //    node on the (org, lead, agent_kind) WHERE status='pending' index.
  const { data: existing } = await client
    .from("agent_approval_queue")
    .select("id")
    .eq("organization_id", input.organization_id)
    .eq("lead_id", lead.id)
    .eq("agent_kind", SITE_VISIT_BOOKING_AGENT_KIND)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return { ok: true, skipped: "already_pending" };

  // 3. Prefill scheduled_at + project_id from the lead's own data.
  const data = asRecord(lead.data);
  const custom = asRecord(data.custom);
  const scheduled_at =
    pickDatetime([custom.preferred_date, data.preferred_date]) ??
    new Date().toISOString();
  const project_id = pickUuid([data.project_id, custom.project_id]);

  // 4. Create the draft site_visit node + the attended edge to the lead.
  let site_visit_id: string;
  try {
    const created = await createNode(
      {
        organization_id: input.organization_id,
        workspace_id: lead.workspace_id,
        node_type: "site_visit",
        label: `Site visit (draft) — ${lead.label}`,
        data: {
          lead_id: lead.id,
          scheduled_at,
          ...(project_id ? { project_id } : {}),
        },
        state: "draft",
        created_by: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
        created_via: "system",
      },
      client,
    );
    site_visit_id = created.id;
  } catch (err) {
    return {
      ok: false,
      error: "create_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  await client.from("edges").insert({
    organization_id: input.organization_id,
    workspace_id: lead.workspace_id,
    from_node_id: site_visit_id,
    to_node_id: lead.id,
    edge_type: "attended",
    created_by: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
    created_via: "system",
    updated_by: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
    updated_via: "system",
  });

  // 5. Enqueue the site_visit_booking row, pointing at the draft visit.
  const { data: inserted, error: insErr } = await client
    .from("agent_approval_queue")
    .insert({
      organization_id: input.organization_id,
      workspace_id: lead.workspace_id,
      lead_id: lead.id,
      agent_kind: SITE_VISIT_BOOKING_AGENT_KIND,
      channel: "whatsapp",
      draft_body:
        "Site visit booking — fill in the cab details to confirm the " +
        "visit and notify the customer.",
      status: "pending",
      ref_node_id: site_visit_id,
      created_by_agent_id: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
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
    return {
      ok: false,
      error: "enqueue_failed",
      message: insErr.message,
    };
  }

  return {
    ok: true,
    queue_id: (inserted as { id: string }).id,
    site_visit_id,
  };
}

// ── Confirm: submit the cab form ───────────────────────────────────────────

async function resolveProjectName(
  client: SupabaseClient,
  organization_id: string,
  project_id: string | null,
): Promise<string | null> {
  if (!project_id) return null;
  const { data } = await client
    .from("nodes")
    .select("label, data")
    .eq("id", project_id)
    .eq("organization_id", organization_id)
    .eq("node_type", "project")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as { label: string; data: Record<string, unknown> | null };
  const name = asRecord(row.data).name;
  return typeof name === "string" && name.trim() ? name : row.label;
}

async function writeLeadActivity(
  client: SupabaseClient,
  args: {
    organization_id: string;
    workspace_id: string;
    lead_id: string;
    label: string;
    summary: string;
  },
): Promise<void> {
  const act = await client
    .from("nodes")
    .insert({
      organization_id: args.organization_id,
      workspace_id: args.workspace_id,
      node_type: "activity",
      label: args.label,
      state: null,
      data: { kind: "site_visit", summary: args.summary },
      created_by: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
      created_via: "system",
      updated_by: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
      updated_via: "system",
    })
    .select("id")
    .single();
  const actId = (act as { data: { id: string } | null }).data?.id;
  if (!actId) return;
  await client.from("edges").insert({
    organization_id: args.organization_id,
    workspace_id: args.workspace_id,
    from_node_id: actId,
    to_node_id: args.lead_id,
    edge_type: "describes",
    created_by: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
    created_via: "system",
    updated_by: SITE_VISIT_AGENT_SERVICE_ACCOUNT,
    updated_via: "system",
  });
}

export type ConfirmSiteVisitBookingDeps = {
  client?: SupabaseClient;
  dispatch?: typeof dispatchApprovedDraft;
};

export type ConfirmSiteVisitBookingArgs = {
  organization_id: string;
  actor_id: string;
  queue_id: string;
  cab: unknown;
};

export type ConfirmSiteVisitBookingResult =
  | {
      ok: true;
      site_visit_id: string;
      assigned_sales_rep_id: string | null;
      dispatch: "sent" | "deferred";
    }
  | {
      ok: false;
      reason:
        | "queue_not_found"
        | "not_pending"
        | "wrong_kind"
        | "no_ref_node"
        | "visit_not_found"
        | "validation"
        | "internal";
      message?: string;
    };

/**
 * Finalize a site_visit_booking: validate the cab form, write the cab
 * fields + assignment onto the draft visit, transition draft → scheduled,
 * compose the WhatsApp confirmation, and dispatch it. Org-scoped — the
 * queue row and the ref'd visit are both verified in the caller's org
 * before any write.
 */
export async function confirmSiteVisitBooking(
  args: ConfirmSiteVisitBookingArgs,
  deps: ConfirmSiteVisitBookingDeps = {},
): Promise<ConfirmSiteVisitBookingResult> {
  const client = deps.client ?? getSupabaseAdmin();
  const dispatch = deps.dispatch ?? dispatchApprovedDraft;

  // 1. Validate the cab form.
  const parsed = cabDetailsSchema.safeParse(args.cab);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid cab details",
    };
  }
  const cab = parsed.data;

  // 2. Load the queue row — org-scoped.
  const { data: qRow } = await client
    .from("agent_approval_queue")
    .select(
      "id, organization_id, workspace_id, lead_id, agent_kind, status, ref_node_id",
    )
    .eq("id", args.queue_id)
    .eq("organization_id", args.organization_id)
    .maybeSingle();
  if (!qRow) return { ok: false, reason: "queue_not_found" };
  const q = qRow as {
    id: string;
    workspace_id: string | null;
    lead_id: string;
    agent_kind: string;
    status: string;
    ref_node_id: string | null;
  };
  if (q.agent_kind !== SITE_VISIT_BOOKING_AGENT_KIND) {
    return { ok: false, reason: "wrong_kind" };
  }
  if (q.status !== "pending") return { ok: false, reason: "not_pending" };
  if (!q.ref_node_id) return { ok: false, reason: "no_ref_node" };

  // 3. Verify the draft visit is in the caller's org (the load-bearing guard
  //    before updateNodeData, which reads by id only).
  const { data: svRow } = await client
    .from("nodes")
    .select("id, data, workspace_id")
    .eq("id", q.ref_node_id)
    .eq("organization_id", args.organization_id)
    .eq("node_type", "site_visit")
    .is("deleted_at", null)
    .maybeSingle();
  if (!svRow) return { ok: false, reason: "visit_not_found" };
  const sv = svRow as {
    id: string;
    data: Record<string, unknown> | null;
    workspace_id: string;
  };

  // 4. Resolve the project's sales rep (D-608) — primary, or on-leave fallback.
  const projectId =
    typeof asRecord(sv.data).project_id === "string"
      ? (asRecord(sv.data).project_id as string)
      : null;
  let assigned_sales_rep_id: string | null = null;
  if (projectId) {
    const resolved = await resolveSalesRepForProject(
      args.organization_id,
      projectId,
      client,
    );
    assigned_sales_rep_id = resolved?.sales_rep_id ?? null;
  }

  // 5. Write the cab fields + assignment + confirmed time onto the visit.
  try {
    await updateNodeData(
      {
        id: sv.id,
        partial: {
          scheduled_at: cab.scheduled_at,
          pickup_address: cab.pickup_address,
          pickup_time: cab.pickup_time,
          cab_provider: cab.cab_provider,
          ...(cab.cab_booking_ref
            ? { cab_booking_ref: cab.cab_booking_ref }
            : {}),
          driver_name: cab.driver_name,
          driver_phone: cab.driver_phone,
          vehicle_number: cab.vehicle_number,
          ...(assigned_sales_rep_id ? { assigned_sales_rep_id } : {}),
        },
        updated_by: args.actor_id,
      },
      client,
    );
  } catch (err) {
    return {
      ok: false,
      reason: "internal",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 6. Transition draft → scheduled (audit-logged, re-checks caller_org_id).
  try {
    await transitionSiteVisit(
      {
        id: sv.id,
        target_state: "scheduled",
        actor: args.actor_id,
        caller_org_id: args.organization_id,
      },
      client,
    );
  } catch (err) {
    return {
      ok: false,
      reason: "internal",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 7. Compose the customer WhatsApp confirmation.
  const { data: leadRow } = await client
    .from("nodes")
    .select("label")
    .eq("id", q.lead_id)
    .eq("organization_id", args.organization_id)
    .maybeSingle();
  const leadLabel =
    (leadRow as { label?: string } | null)?.label ?? "there";
  const projectName = await resolveProjectName(
    client,
    args.organization_id,
    projectId,
  );
  const confirmation = composeSiteVisitConfirmation({
    lead_first_name: deriveFirstName(leadLabel),
    cab,
    project_name: projectName,
  });

  // 8. Approve the queue row with the composed body, ready for dispatch.
  await client
    .from("agent_approval_queue")
    .update({
      status: "approved",
      edited_body: confirmation,
      decided_at: new Date().toISOString(),
      decided_by: args.actor_id,
    })
    .eq("id", q.id)
    .eq("organization_id", args.organization_id);

  // 9. Provenance activity nodes on the lead.
  await writeLeadActivity(client, {
    organization_id: args.organization_id,
    workspace_id: sv.workspace_id,
    lead_id: q.lead_id,
    label: "Site visit booked",
    summary: `Visit scheduled — cab ${cab.vehicle_number}, driver ${cab.driver_name}.`,
  });
  await writeLeadActivity(client, {
    organization_id: args.organization_id,
    workspace_id: sv.workspace_id,
    lead_id: q.lead_id,
    label: assigned_sales_rep_id
      ? "Sales rep assigned"
      : "No project rep — coordinator to assign",
    summary: assigned_sales_rep_id
      ? `Auto-assigned the project's sales rep to this site visit.`
      : `No sales rep mapped to this project — a coordinator must assign one.`,
  });

  // 10. Dispatch the WhatsApp confirmation via the D-415/D-603 path.
  const dispatchResult = await dispatch(
    {
      queue_id: q.id,
      organization_id: args.organization_id,
      actor_id: args.actor_id,
    },
    client,
  );
  const dispatched: "sent" | "deferred" = dispatchResult.ok
    ? "sent"
    : "deferred";
  if (dispatched === "sent") {
    await writeLeadActivity(client, {
      organization_id: args.organization_id,
      workspace_id: sv.workspace_id,
      lead_id: q.lead_id,
      label: "Customer notified",
      summary: "Site visit confirmation sent to the customer on WhatsApp.",
    });
  }

  return {
    ok: true,
    site_visit_id: sv.id,
    assigned_sales_rep_id,
    dispatch: dispatched,
  };
}
